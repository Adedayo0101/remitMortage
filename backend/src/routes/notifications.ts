import { Router, Request, Response } from "express";
import logger from "../utils/logger.js";
import { getNotificationPreference, upsertNotificationPreference } from "../services/db.js";
import { dispatchMaturityAlerts } from "../services/notification.ts";

export const notificationsRouter = Router();

/**
 * GET /api/notifications/preferences
 * Fetch notification preferences for a user by address or applicantId.
 */
notificationsRouter.get("/preferences", async (req: Request, res: Response) => {
  const address = (req.query.address || req.query.userId) as string;

  if (!address) {
    return res.status(400).json({ error: "Address or userId query parameter is required." });
  }

  try {
    const preferences = await getNotificationPreference(address);
    return res.json({ preferences: preferences || null });
  } catch (error: any) {
    logger.error("[NotificationsRouter] Error fetching preferences:", { error });
    return res.status(500).json({ error: "Failed to fetch notification preferences." });
  }
});

/**
 * POST /api/notifications/preferences
 * Save notification preferences for a user in the database.
 */
notificationsRouter.post("/preferences", async (req: Request, res: Response) => {
  const { address, userId, email, phone, emailAlerts, smsAlerts, escrowApproaching, escrowReached, paymentMissed, loanMilestones, webhookUrl } = req.body;
  const targetId = address || userId;

  if (!targetId) {
    return res.status(400).json({ error: "Address or userId is required." });
  }

  try {
    const updated = await upsertNotificationPreference(targetId, {
      email,
      phone,
      emailAlerts: Boolean(emailAlerts),
      smsAlerts: Boolean(smsAlerts),
      escrowApproaching: Boolean(escrowApproaching),
      escrowReached: Boolean(escrowReached),
      paymentMissed: Boolean(paymentMissed),
      loanMilestones: Boolean(loanMilestones),
      webhookUrl,
    });

    return res.json({ success: true, preferences: updated });
  } catch (error: any) {
    logger.error("[NotificationsRouter] Error saving preferences:", { error });
    return res.status(500).json({ error: "Failed to save notification preferences." });
  }
});

/**
 * POST /api/notifications/evaluate
 * Triggers evaluation and dispatch of escrow maturity or milestone alerts based on user settings.
 */
notificationsRouter.post("/evaluate", async (req: Request, res: Response) => {
  const { address, event } = req.body;

  if (!address || !event || !event.type) {
    return res.status(400).json({ error: "Address and event specification are required." });
  }

  try {
    await dispatchMaturityAlerts(address, event);
    return res.json({ success: true, message: `Maturity alert evaluated for ${event.type}` });
  } catch (error: any) {
    logger.error("[NotificationsRouter] Error evaluating maturity alert:", { error });
    return res.status(500).json({ error: "Failed to evaluate maturity alert." });
  }
});
