import { Router, Request, Response } from "express";
import { prisma } from "../services/db.js";
import { sendWebhook } from "../services/webhook.js";
import { runEscrowReconciliation } from "../jobs/escrowReconciliation.js";
import logger from "../utils/logger.js";

export const adminRouter = Router();

// Trigger manual retry of a DLQ job
adminRouter.post("/webhooks/dlq/:id/retry", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const dlqRecord = await prisma.webhookDLQ.findUnique({
      where: { id },
    });

    if (!dlqRecord) {
      res.status(404).json({ error: "DLQ record not found" });
      return;
    }

    const payload = typeof dlqRecord.payload === "string" 
      ? JSON.parse(dlqRecord.payload) 
      : dlqRecord.payload;

    const webhookResult = await sendWebhook(dlqRecord.url, payload);

    if (webhookResult.success) {
      // If success, remove from DLQ
      await prisma.webhookDLQ.delete({
        where: { id },
      });
      res.json({ success: true, message: "Webhook retry succeeded and removed from DLQ" });
    } else {
      // If still fails, update DLQ record with new error/status
      await prisma.webhookDLQ.update({
        where: { id },
        data: {
          statusCode: webhookResult.status,
          responsePayload: webhookResult.responsePayload,
          error: webhookResult.error,
        },
      });
      res.status(500).json({ 
        success: false, 
        error: "Webhook retry failed", 
        details: webhookResult 
      });
    }
  } catch (err: any) {
    logger.error(`[AdminRouter] Failed to retry DLQ ${id}`, { err });
    res.status(500).json({ error: "Internal server error during retry" });
  }
});

/**
 * @openapi
 * /api/admin/escrow/reconcile:
 *   post:
 *     summary: Trigger manual escrow balance reconciliation
 *     description: >-
 *       Ops-only. Fetches current on-chain USDC balances for all borrower
 *       accounts from Horizon, compares them against the Postgres cache, and
 *       overwrites any mismatched cached values with the on-chain truth.
 *       Also clears outstanding mismatch alerts once corrected.
 *     tags:
 *       - Admin
 *     responses:
 *       200:
 *         description: Reconciliation complete. Returns counts of scanned, mismatches, corrected, and errors.
 *       500:
 *         description: Reconciliation job threw an unexpected error.
 */
adminRouter.post("/escrow/reconcile", async (req: Request, res: Response) => {
  try {
    logger.info("[AdminRouter] Manual escrow reconciliation triggered", {
      ip: req.ip,
    });

    // autoCorrect=true: fix cached values and clear the alert
    const result = await runEscrowReconciliation(true);

    res.json({
      success: true,
      scanned: result.scanned,
      mismatches: result.mismatches.length,
      corrected: result.corrected,
      errors: result.errors,
      details: result.mismatches,
    });
  } catch (err: any) {
    logger.error("[AdminRouter] Escrow reconciliation failed", { err });
    res.status(500).json({ error: "Reconciliation job failed", message: err.message });
  }
});
