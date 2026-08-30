import { Router } from "express";
import { StrKey } from "@stellar/stellar-sdk";
import logger from "../utils/logger.js";
import {
  validatePositiveNumber,
  validateOptionalGuarantorAddress,
} from "../middleware/validate.js";
import {
  createApplication,
  getApplication,
  getApplicationsByBorrower,
  getPendingApplications,
  updateApplication,
  escrowTargetMetForAmount,
} from "../services/loanStore.js";
import {
  verifyStellarGuarantorSignature,
  buildGuarantorCommitment,
} from "../services/guarantor.js";
import { queueNotification } from "../services/notification.js";

export const loanRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/loan/apply
//
// Optional guarantor support
// ──────────────────────────
// The borrower may attach a co-signer/guarantor by supplying two additional
// body fields:
//
//   guarantorAddress   — Stellar G-address of the guarantor
//   guarantorSignature — hex-encoded Ed25519 signature produced by the
//                        guarantor over:
//                          "guarantee:<borrowerAddress>:<amount>:<applicationId>"
//
// Authorization is verified by verifyStellarGuarantorSignature (same nacl
// Ed25519 mechanism used in the DID verification flow).  If the address is
// present but the signature is missing or invalid, the request is rejected
// with 400 — the guarantor cannot be attached without explicit authorization.
//
// When no guarantorAddress is supplied the loan is created exactly as before.
// ---------------------------------------------------------------------------
loanRouter.post(
  "/apply",
  validatePositiveNumber("amount"),
  validateOptionalGuarantorAddress,
  async (req, res) => {
    try {
      const {
        borrowerAddress,
        amount,
        guarantorAddress,
        guarantorSignature,
      } = req.body ?? {};

      if (!borrowerAddress) {
        return res.status(400).json({
          error: "missing_field",
          field: "borrowerAddress",
          message: "borrowerAddress is required",
        });
      }

      try {
        StrKey.decodeEd25519PublicKey(borrowerAddress);
      } catch {
        return res.status(400).json({
          error: "invalid_address",
          field: "borrowerAddress",
          message: "Invalid Stellar G-address",
        });
      }

      const escrowOk = escrowTargetMetForAmount(amount);
      if (!escrowOk) {
        return res.status(400).json({
          error: "escrow_target_not_met",
          message: "Escrow target not reached for borrower",
        });
      }

      // ── Guarantor authorization ──────────────────────────────────────────
      // A guarantor can only be accepted with a cryptographically valid
      // signature.  We generate the application ID first so it can be
      // embedded in the commitment string, then verify before persisting.

      let guarantorOpts:
        | { address: string; signature: string; status: "Accepted" | "Rejected" }
        | undefined;

      if (guarantorAddress) {
        // guarantorSignature is mandatory when an address is supplied
        if (!guarantorSignature || typeof guarantorSignature !== "string") {
          return res.status(400).json({
            error: "missing_field",
            field: "guarantorSignature",
            message:
              "guarantorSignature is required when guarantorAddress is provided",
          });
        }

        // The guarantor must not be the same person as the borrower
        if (guarantorAddress === borrowerAddress) {
          return res.status(400).json({
            error: "invalid_guarantor",
            message: "guarantorAddress must differ from borrowerAddress",
          });
        }

        // Generate the application ID upfront so we can include it in the
        // commitment string the guarantor signed.  This ties the signature to
        // exactly this loan application and prevents replay attacks.
        //
        // We pass this id explicitly into createApplication below so the same
        // id is persisted.  loanStore.createApplication uses makeId() by
        // default; we bypass that by passing an override id.
        const { id: precomputedId } = generateApplicationId();

        const commitment = buildGuarantorCommitment(
          borrowerAddress,
          String(amount),
          precomputedId
        );

        const valid = verifyStellarGuarantorSignature(
          guarantorAddress,
          borrowerAddress,
          String(amount),
          precomputedId,
          guarantorSignature
        );

        if (!valid) {
          return res.status(400).json({
            error: "invalid_guarantor_signature",
            message:
              "Guarantor signature is invalid or does not match the loan commitment. " +
              `The guarantor must sign: "${commitment}"`,
          });
        }

        guarantorOpts = {
          address: guarantorAddress,
          signature: guarantorSignature,
          status: "Accepted",
        };

        // Pass the precomputed id through to createApplication
        const app = await createApplicationWithId(
          precomputedId,
          borrowerAddress,
          String(amount),
          guarantorOpts
        );
        return res.status(201).json(app);
      }

      // ── No guarantor — existing behaviour ────────────────────────────────
      const app = await createApplication(
        borrowerAddress,
        String(amount)
      );
      return res.status(201).json(app);
    } catch (error) {
      logger.error("Loan apply error", { error });
      return res.status(500).json({ error: "failed_to_create_application" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/loan/borrower/:address
// ---------------------------------------------------------------------------
loanRouter.get("/borrower/:address", async (req, res) => {
  const { address } = req.params ?? {};
  try {
    StrKey.decodeEd25519PublicKey(address);
  } catch {
    return res
      .status(400)
      .json({ error: "invalid_address", field: "address", message: "Invalid Stellar G-address" });
  }
  const apps = await getApplicationsByBorrower(address);
  return res.json(apps);
});

// ---------------------------------------------------------------------------
// GET /api/loan/pending
// ---------------------------------------------------------------------------
loanRouter.get("/pending", async (req, res) => {
  const pending = await getPendingApplications();
  return res.json(pending);
});

// ---------------------------------------------------------------------------
// POST /api/loan/:id/approve
//
// When the loan carries a guarantor that was NOT accepted (guarantorStatus ≠
// "Accepted"), the approval is blocked.  This prevents an admin from
// approving a guaranteed loan whose guarantor never authorized.
// ---------------------------------------------------------------------------
loanRouter.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const app = await getApplication(id);
  if (!app) return res.status(404).json({ error: "not_found" });

  if (app.status !== "Pending") {
    return res.status(400).json({
      error: "invalid_state",
      message: "Application must be Pending to approve",
    });
  }

  // Block approval when a guarantor address is present but not accepted
  if (app.guarantorAddress && app.guarantorStatus !== "Accepted") {
    return res.status(400).json({
      error: "guarantor_not_accepted",
      message:
        "This loan has a guarantor whose authorization is missing or invalid. " +
        "Guarantor must provide a valid signature before the loan can be approved.",
    });
  }

  try {
    const approved = await updateApplication(id, { status: "Approved" });

    // simulate request_loan + approve_loan
    logger.info(`Simulating on-chain request_loan for application ${id}`);
    // After simulation, proceed to Disbursing
    const disbursing = updateApplication(id, { status: "Disbursing" });

    const email = req.body.email || `${app.borrowerAddress}@example.com`;
    const webhookUrl =
      req.body.webhookUrl || "https://partner-platform.com/webhooks";

    if (approved) {
      await queueNotification(
        email,
        "EMAIL",
        JSON.stringify({
          template: "loan_status_update",
          loanId: id,
          status: "Approved",
        })
      );

      await queueNotification(
        webhookUrl,
        "WEBHOOK",
        JSON.stringify({
          event: "loan.milestone_approved",
          loanId: id,
          borrowerAddress: approved.borrowerAddress,
          status: "Approved",
          timestamp: Date.now(),
        })
      );
    }

    return res.json(disbursing);
  } catch (err) {
    logger.error("Approve error", { err });
    return res.status(500).json({ error: "approve_failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/loan/:id/reject
// ---------------------------------------------------------------------------
loanRouter.post("/:id/reject", async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  const app = await getApplication(id);
  if (!app) return res.status(404).json({ error: "not_found" });

  if (app.status !== "Pending") {
    return res.status(400).json({
      error: "invalid_state",
      message: "Application must be Pending to reject",
    });
  }

  const updated = await updateApplication(id, {
    status: "Rejected",
    reason: reason ?? "No reason provided",
  });
  return res.json(updated);
});

// ---------------------------------------------------------------------------
// GET /api/loan/:id
// ---------------------------------------------------------------------------
loanRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  const app = await getApplication(id);
  if (!app) return res.status(404).json({ error: "not_found" });
  return res.json(app);
});

// ---------------------------------------------------------------------------
// POST /api/loan/:id/trigger-payment-due
// ---------------------------------------------------------------------------
loanRouter.post("/:id/trigger-payment-due", async (req, res) => {
  const { id } = req.params;
  const { email, webhookUrl, amount, dueDate } = req.body ?? {};

  const app = await getApplication(id);
  if (!app) return res.status(404).json({ error: "not_found" });

  const targetEmail = email || `${app.borrowerAddress}@example.com`;
  const targetWebhookUrl =
    webhookUrl || "https://partner-platform.com/webhooks";
  const targetAmount = amount || app.amount;
  const targetDueDate =
    dueDate ||
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const emailNotif = await queueNotification(
      targetEmail,
      "EMAIL",
      JSON.stringify({
        template: "repayment_reminder",
        amount: targetAmount,
        dueDate: targetDueDate,
      })
    );

    const webhookNotif = await queueNotification(
      targetWebhookUrl,
      "WEBHOOK",
      JSON.stringify({
        event: "loan.payment_due",
        loanId: id,
        borrowerAddress: app.borrowerAddress,
        amount: targetAmount,
        dueDate: targetDueDate,
        timestamp: Date.now(),
      })
    );

    return res.json({
      message: "Payment due notifications triggered and queued.",
      emailNotificationId: emailNotif.id,
      webhookNotificationId: webhookNotif.id,
    });
  } catch (error: any) {
    logger.error("Trigger payment due error", { error });
    return res
      .status(500)
      .json({ error: "failed_to_trigger_notifications", message: error.message });
  }
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

import { prisma } from "../services/db.js";

/** Generates a time-based application ID matching makeId() in loanStore. */
function generateApplicationId(): { id: string } {
  const id = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
  return { id };
}

/**
 * Creates a loan application with a pre-determined ID (needed when the ID
 * must be embedded in the guarantor commitment string before persistence).
 */
async function createApplicationWithId(
  id: string,
  borrowerAddress: string,
  amount: string,
  guarantor?: { address: string; signature: string; status: "Accepted" | "Rejected" }
) {
  StrKey.decodeEd25519PublicKey(borrowerAddress);

  const applicant = await prisma.applicant.upsert({
    where: { stellarAddress: borrowerAddress },
    update: {},
    create: { stellarAddress: borrowerAddress },
  });

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

  return {
    id: record.id,
    borrowerAddress: record.applicant.stellarAddress,
    amount: String(record.principal),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: (record.updatedAt ?? record.createdAt).toISOString(),
    ...(record.guarantorAddress
      ? {
          guarantorAddress: record.guarantorAddress,
          guarantorStatus: record.guarantorStatus,
        }
      : {}),
  };
}
