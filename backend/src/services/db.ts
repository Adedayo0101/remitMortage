import { randomUUID, createHash } from "crypto";

const { PrismaClient, Prisma } = require("@prisma/client") as {
  PrismaClient: new () => any;
  Prisma: any;
};

import { encrypt, decrypt } from "../utils/crypto.js";

export type VerificationStatus = "PENDING" | "ELIGIBLE" | "INELIGIBLE";

export const prisma = new PrismaClient();

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

// ── Applicant ─────────────────────────────────────────────────────────────

const ENCRYPTED_FIELDS = ["taxId", "monthlyIncome"] as const;

function encryptFields<T extends Record<string, any>>(data: T): T {
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encrypt(String(result[field]));
    }
  }
  return result;
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
