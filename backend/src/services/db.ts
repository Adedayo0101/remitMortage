const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new (options?: Record<string, unknown>) => any;
};

import { encrypt, decrypt } from "../utils/crypto.js";

export type VerificationStatus = "PENDING" | "ELIGIBLE" | "INELIGIBLE";

// ── Connection pool configuration ────────────────────────────────────────────
//
// Prisma uses its own built-in connection pool on top of the pg driver.
// Under sustained concurrent load the default pool (num_cpus*2+1 connections,
// 10 s acquire timeout) runs out quickly, causing P2024 "connection pool
// timeout" errors. We override three knobs here:
//
//   connection_limit   – maximum open connections to PostgreSQL.
//                        Rule of thumb: (num_cpus * 4), capped at 100 so a
//                        single service instance never exhausts the server's
//                        pg max_connections (default 100).  Override via
//                        DB_CONNECTION_LIMIT env var for multi-instance
//                        deployments where the budget must be shared.
//
//   pool_timeout       – seconds to wait for a free connection before Prisma
//                        throws P2024.  15 s gives queue spikes room to drain
//                        without hanging requests indefinitely.
//
//   connect_timeout    – seconds for the initial TCP handshake to pg.
//                        30 s covers cold-start DNS resolution in cloud envs.
//
// The values are appended to DATABASE_URL as query-string parameters so they
// work with both a plain url (postgres://…) and one that already carries a
// query string.
//
function buildDatabaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;

  const connectionLimit = parseInt(
    process.env.DB_CONNECTION_LIMIT || "20",
    10
  );
  const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || "15", 10);
  const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT || "30", 10);

  const separator = base.includes("?") ? "&" : "?";
  return (
    `${base}${separator}` +
    `connection_limit=${connectionLimit}` +
    `&pool_timeout=${poolTimeout}` +
    `&connect_timeout=${connectTimeout}`
  );
}

const dbUrl = buildDatabaseUrl();

export const prisma = new PrismaClient(
  dbUrl
    ? {
        datasources: {
          db: { url: dbUrl },
        },
      }
    : undefined
);

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

// ── Applicant ─────────────────────────────────────────────────────────────

const ENCRYPTED_FIELDS = ["taxId", "monthlyIncome"] as const;

function encryptFields<T extends Record<string, any>>(data: T): T {
  const result: Record<string, any> = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encrypt(String(result[field]));
    }
  }
  return result as T;
}

function decryptApplicant(applicant: any): any {
  if (!applicant) return applicant;
  const result = { ...applicant };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = decrypt(result[field]);
    }
  }
  return result;
}

function addStroops(a: string, b: string): string {
  return (BigInt(a || "0") + BigInt(b || "0")).toString();
}

function subStroops(a: string, b: string): string {
  const result = BigInt(a || "0") - BigInt(b || "0");
  return (result < 0n ? 0n : result).toString();
}

function eventHash(kind: string, contractId: string, borrower: string, amount: string, ledger: number): string {
  return createHash("sha256")
    .update(`${kind}|${contractId}|${borrower}|${amount}|${ledger}`)
    .digest("hex");
}

function isUniqueConstraintError(error: any, target: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(target)
  );
}

export async function loadIndexerState(key: string) {
  const state = await prisma.eventIndexerState.findUnique({ where: { key } });
  return {
    lastProcessedLedger: state?.lastProcessedLedger ?? 0,
    cursor: state?.cursor ?? null,
  };
}

export async function saveIndexerState(key: string, lastProcessedLedger: number, cursor: string | null) {
  return prisma.eventIndexerState.upsert({
    where: { key },
    create: { key, lastProcessedLedger, cursor },
    update: { lastProcessedLedger, cursor },
  });
}

export async function getBorrower(stellarAddress: string) {
  return prisma.borrower.findUnique({
    where: { stellarAddress },
  });
}

export async function getBorrowerStatus(stellarAddress: string) {
  return prisma.borrower.findUnique({
    where: { stellarAddress },
    select: {
      stellarAddress: true,
      escrowBalance: true,
      loanOutstanding: true,
      totalDeposited: true,
      totalDisbursed: true,
      totalRepaid: true,
      lastEventLedger: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function ensureBorrower(stellarAddress: string) {
  return prisma.borrower.upsert({
    where: { stellarAddress },
    create: { stellarAddress },
    update: {},
  });
}

export async function recordEscrowDeposit(
  stellarAddress: string,
  contractId: string,
  amount: string,
  ledger: number
) {
  const borrower = await ensureBorrower(stellarAddress);
  const hash = eventHash("deposit", contractId, stellarAddress, amount, ledger);
  try {
    await prisma.escrowDeposit.create({
      data: {
        borrowerId: borrower.id,
        contractId,
        amount,
        ledger,
        eventHash: hash,
      },
    });
  } catch (err: any) {
    if (isUniqueConstraintError(err, "eventHash")) {
      return borrower;
    }
    throw err;
  }

  return prisma.borrower.update({
    where: { id: borrower.id },
    data: {
      escrowBalance: addStroops(borrower.escrowBalance, amount),
      totalDeposited: addStroops(borrower.totalDeposited, amount),
      lastEventLedger: Math.max(borrower.lastEventLedger, ledger),
    },
  });
}

export async function recordEscrowWithdrawal(
  stellarAddress: string,
  contractId: string,
  amount: string,
  ledger: number
) {
  const borrower = await ensureBorrower(stellarAddress);
  const hash = eventHash("withdraw", contractId, stellarAddress, amount, ledger);
  try {
    await prisma.escrowWithdrawal.create({
      data: {
        borrowerId: borrower.id,
        contractId,
        amount,
        ledger,
        eventHash: hash,
      },
    });
  } catch (err: any) {
    if (isUniqueConstraintError(err, "eventHash")) {
      return borrower;
    }
    throw err;
  }

  return prisma.borrower.update({
    where: { id: borrower.id },
    data: {
      escrowBalance: subStroops(borrower.escrowBalance, amount),
      lastEventLedger: Math.max(borrower.lastEventLedger, ledger),
    },
  });
}

export async function recordLoanDisbursement(
  stellarAddress: string,
  contractId: string,
  amount: string,
  ledger: number
) {
  const borrower = await ensureBorrower(stellarAddress);
  const hash = eventHash("disburse", contractId, stellarAddress, amount, ledger);
  try {
    await prisma.loanDisbursement.create({
      data: {
        borrowerId: borrower.id,
        contractId,
        amount,
        ledger,
        eventHash: hash,
      },
    });
  } catch (err: any) {
    if (isUniqueConstraintError(err, "eventHash")) {
      return borrower;
    }
    throw err;
  }

  return prisma.borrower.update({
    where: { id: borrower.id },
    data: {
      loanOutstanding: addStroops(borrower.loanOutstanding, amount),
      totalDisbursed: addStroops(borrower.totalDisbursed, amount),
      lastEventLedger: Math.max(borrower.lastEventLedger, ledger),
    },
  });
}

export async function recordLoanRepayment(
  stellarAddress: string,
  contractId: string,
  amount: string,
  ledger: number
) {
  const borrower = await ensureBorrower(stellarAddress);
  const hash = eventHash("repay", contractId, stellarAddress, amount, ledger);
  try {
    await prisma.loanRepayment.create({
      data: {
        borrowerId: borrower.id,
        contractId,
        amount,
        ledger,
        eventHash: hash,
      },
    });
  } catch (err: any) {
    if (isUniqueConstraintError(err, "eventHash")) {
      return borrower;
    }
    throw err;
  }

  return prisma.borrower.update({
    where: { id: borrower.id },
    data: {
      loanOutstanding: subStroops(borrower.loanOutstanding, amount),
      totalRepaid: addStroops(borrower.totalRepaid, amount),
      lastEventLedger: Math.max(borrower.lastEventLedger, ledger),
    },
  });
}

// ── Applicant ─────────────────────────────────────────────────────────────────

export async function upsertApplicant(
  stellarAddress: string,
  data: {
    verificationStatus?: VerificationStatus;
    creditScore?: number;
    taxId?: string;
    monthlyIncome?: string;
  }
) {
  const encrypted = encryptFields(data);
  return prisma.applicant.upsert({
    where: { stellarAddress },
    update: { ...encrypted, updatedAt: new Date() },
    create: { stellarAddress, ...encrypted },
  });
}

export async function getApplicant(stellarAddress: string) {
  const applicant = await prisma.applicant.findUnique({
    where: { stellarAddress },
    include: {
      verificationResults: { orderBy: { analyzedAt: "desc" }, take: 1 },
      loanApplications: { orderBy: { createdAt: "desc" }, take: 1 },
      notificationPreference: true,
    },
  });
  return decryptApplicant(applicant);
}

// ── VerificationResult ────────────────────────────────────────────────────

export async function createVerificationResult(data: {
  applicantId: string;
  reportHash: string;
  totalPayments: number;
  totalVolume: number;
  spanMonths: number;
  eligible: boolean;
}) {
  return prisma.verificationResult.create({ data });
}

// ── LoanApplication ────────────────────────────────────────────────────────

export async function createLoanApplication(data: {
  applicantId: string;
  escrowContractId?: string;
  loanId?: string;
  principal: number;
}) {
  return prisma.loanApplication.create({ data });
}

// ── NotificationPreference ─────────────────────────────────────────────────

export type NotificationPreferenceData = {
  email?: string;
  phone?: string;
  emailAlerts?: boolean;
  smsAlerts?: boolean;
  escrowApproaching?: boolean;
  escrowReached?: boolean;
  paymentMissed?: boolean;
  loanMilestones?: boolean;
  webhookUrl?: string;
};

export async function getNotificationPreference(stellarAddressOrId: string) {
  // First try finding applicant by stellarAddress or id
  let applicant = await prisma.applicant.findFirst({
    where: {
      OR: [
        { stellarAddress: stellarAddressOrId },
        { id: stellarAddressOrId },
      ],
    },
    include: { notificationPreference: true },
  });

  if (!applicant) {
    // Auto-create applicant if address matches Stellar public key pattern
    if (stellarAddressOrId.startsWith("G") && stellarAddressOrId.length === 56) {
      applicant = await prisma.applicant.create({
        data: { stellarAddress: stellarAddressOrId },
        include: { notificationPreference: true },
      });
    } else {
      return null;
    }
  }

  return applicant.notificationPreference;
}

export async function upsertNotificationPreference(
  stellarAddressOrId: string,
  data: NotificationPreferenceData
) {
  let applicant = await prisma.applicant.findFirst({
    where: {
      OR: [
        { stellarAddress: stellarAddressOrId },
        { id: stellarAddressOrId },
      ],
    },
  });

  if (!applicant) {
    const stellarAddress =
      stellarAddressOrId.startsWith("G") && stellarAddressOrId.length === 56
        ? stellarAddressOrId
        : `G_${stellarAddressOrId.slice(0, 50)}`;

    applicant = await prisma.applicant.create({
      data: { stellarAddress },
    });
  }

  return prisma.notificationPreference.upsert({
    where: { applicantId: applicant.id },
    update: {
      ...data,
      updatedAt: new Date(),
    },
    create: {
      applicantId: applicant.id,
      ...data,
    },
  });
}

