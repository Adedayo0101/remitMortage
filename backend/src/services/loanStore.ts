import { StrKey } from "@stellar/stellar-sdk";
import { prisma } from "./db.js";

// lightweight id generator to avoid adding dependencies
function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
}

export type LoanStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Disbursing"
  | "Repaying"
  | "Completed";

/** Authorization state of an attached guarantor — mirrors the Prisma enum. */
export type GuarantorStatus = "Accepted" | "Rejected";

export interface LoanApplication {
  id: string;
  borrowerAddress: string;
  amount: string;
  status: LoanStatus;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  /** Present only when a guarantor was attached to this loan. */
  guarantorAddress?: string;
  /** Present only when a guarantor was attached to this loan. */
  guarantorStatus?: GuarantorStatus;
}

/** Options for attaching a guarantor at application creation time. */
export interface GuarantorOptions {
  /** Guarantor's Stellar G-address. */
  address: string;
  /**
   * Hex-encoded Ed25519 signature produced by the guarantor over the
   * canonical commitment string (see services/guarantor.ts).
   */
  signature: string;
  /** Pre-verified status — caller is responsible for running verification. */
  status: GuarantorStatus;
}

function mapLoanApplication(record: any): LoanApplication {
  const app: LoanApplication = {
    id: record.id,
    borrowerAddress: record.applicant.stellarAddress,
    amount: String(record.principal),
    status: record.status,
    reason: record.reason ?? undefined,
    createdAt: record.createdAt.toISOString(),
    // updatedAt is not on the schema model; fall back to createdAt
    updatedAt: (record.updatedAt ?? record.createdAt).toISOString(),
  };

  if (record.guarantorAddress) {
    app.guarantorAddress = record.guarantorAddress;
    app.guarantorStatus = record.guarantorStatus ?? undefined;
  }

  return app;
}

async function findOrCreateApplicant(stellarAddress: string) {
  return prisma.applicant.upsert({
    where: { stellarAddress },
    update: {},
    create: { stellarAddress },
  });
}

/**
 * Creates a new loan application.
 *
 * When `guarantor` is supplied the guarantor address and the pre-verified
 * status are stored.  The caller (route handler) is responsible for running
 * `verifyStellarGuarantorSignature` before calling this function and passing
 * the result as `guarantor.status`.
 *
 * No guarantor is attached when `guarantor` is omitted — existing
 * borrower-only behaviour is fully preserved.
 */
export async function createApplication(
  borrowerAddress: string,
  amount: string,
  guarantor?: GuarantorOptions
) {
  StrKey.decodeEd25519PublicKey(borrowerAddress);

  const applicant = await findOrCreateApplicant(borrowerAddress);
  const id = makeId();

  const record = await prisma.loanApplication.create({
    data: {
      id,
      applicantId: applicant.id,
      principal: Number(amount),
      status: "Pending",
      ...(guarantor
        ? {
            guarantorAddress: guarantor.address,
            guarantorSignature: guarantor.signature,
            guarantorStatus: guarantor.status,
          }
        : {}),
    },
    include: { applicant: true },
  });

  return mapLoanApplication(record);
}

export async function getApplication(id: string) {
  const record = await prisma.loanApplication.findUnique({
    where: { id },
    include: { applicant: true },
  });

  return record ? mapLoanApplication(record) : null;
}

export async function getApplicationsByBorrower(address: string) {
  const records = await prisma.loanApplication.findMany({
    where: { applicant: { stellarAddress: address } },
    include: { applicant: true },
  });

  return records.map(mapLoanApplication);
}

export async function getPendingApplications() {
  const records = await prisma.loanApplication.findMany({
    where: { status: "Pending" },
    include: { applicant: true },
  });

  return records.map(mapLoanApplication);
}

export async function listApplications() {
  const records = await prisma.loanApplication.findMany({
    include: { applicant: true },
  });
  return records.map(mapLoanApplication);
}

export async function updateApplication(id: string, patch: Partial<LoanApplication>) {
  const existing = await prisma.loanApplication.findUnique({
    where: { id },
  });
  if (!existing) return null;

  if (patch.borrowerAddress) {
    await prisma.applicant.update({
      where: { id: existing.applicantId },
      data: { stellarAddress: patch.borrowerAddress },
    });
  }

  const updateData: {
    principal?: number;
    status?: LoanStatus;
    reason?: string | null;
  } = {};

  if (patch.amount !== undefined) updateData.principal = Number(patch.amount);
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.reason !== undefined) updateData.reason = patch.reason ?? null;

  const record = Object.keys(updateData).length
    ? await prisma.loanApplication.update({
        where: { id },
        data: updateData,
        include: { applicant: true },
      })
    : await prisma.loanApplication.findUnique({
        where: { id },
        include: { applicant: true },
      });

  return record ? mapLoanApplication(record) : null;
}

// Simple escrow check: for demo purposes consider escrow "met" when requested amount is <= 5000
export function escrowTargetMetForAmount(amount: string) {
  const num = Number(amount);
  if (Number.isNaN(num) || num <= 0) return false;
  return num <= 5000;
}
