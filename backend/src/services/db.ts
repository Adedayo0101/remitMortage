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

