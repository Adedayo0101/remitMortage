import crypto from "crypto";
import logger from "../utils/logger.js";
import { loadConfig } from "../config.js";

const config = loadConfig();

export interface WebhookResult {
  success: boolean;
  status?: number;
  responsePayload?: string;
  error?: string;
}

/**
 * Sends a signed webhook payload to a specified partner URL.
 * Signs the payload using HMAC-SHA256 with the configured secret.
 */
export async function sendWebhook(url: string, payload: any): Promise<WebhookResult> {
  const secret = config.webhookSecret;
  const timestamp = Date.now().toString();
  const bodyString = JSON.stringify(payload);

  // Sign payload using HMAC SHA-256: hmac(secret, timestamp + '.' + body)
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${bodyString}`);
  const signature = hmac.digest("hex");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature": signature,
      },
      body: bodyString,
    });
    
    const responsePayload = await response.text();

    if (!response.ok) {
      logger.error(`[WebhookService] HTTP Error from ${url}`, { status: response.status });
      return { success: false, status: response.status, responsePayload };
    }

    return { success: true, status: response.status, responsePayload };
  } catch (error: any) {
    logger.error(`[WebhookService] Fetch failure sending webhook to ${url}`, { error });
    return { success: false, error: error.message || String(error) };
  }
}
