import { Router, Request, Response } from "express";
import { prisma } from "../services/db.js";
import { sendWebhook } from "../services/webhook.js";
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
