import cron from "node-cron";
import { runRepaymentAudit } from "./repaymentAudit.js";
import { runKycExpiryReminderJob } from "./kycExpiryReminder.js";
import { runEscrowReconciliation } from "./escrowReconciliation.js";

let schedulerTask: ReturnType<typeof cron.schedule> | null = null;
let kycExpiryTask: ReturnType<typeof cron.schedule> | null = null;
let escrowReconciliationTask: ReturnType<typeof cron.schedule> | null = null;

export function startScheduler() {
  if (schedulerTask) {
    console.log("[Scheduler] Already running, ignoring start request.");
    return;
  }

  // Daily at midnight UTC: repayment audit
  schedulerTask = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] Triggering repayment audit job...");
    await runRepaymentAudit();
  }, { timezone: "UTC" });

  // Daily at 08:00 UTC: KYC document expiry reminders
  const kycSchedule = process.env.KYC_EXPIRY_CRON_SCHEDULE || "0 8 * * *";
  kycExpiryTask = cron.schedule(kycSchedule, async () => {
    console.log("[Scheduler] Triggering KYC expiry reminder job...");
    await runKycExpiryReminderJob();
  }, { timezone: "UTC" });

  // Every 4 hours: escrow balance reconciliation
  const reconcileSchedule = process.env.ESCROW_RECONCILIATION_CRON_SCHEDULE || "0 */4 * * *";
  escrowReconciliationTask = cron.schedule(reconcileSchedule, async () => {
    console.log("[Scheduler] Triggering escrow reconciliation job...");
    await runEscrowReconciliation();
  }, { timezone: "UTC" });

  console.log("[Scheduler] Started: repayment audit, KYC expiry reminder, and escrow reconciliation jobs scheduled.");
}

export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
  if (kycExpiryTask) {
    kycExpiryTask.stop();
    kycExpiryTask = null;
  }
  if (escrowReconciliationTask) {
    escrowReconciliationTask.stop();
    escrowReconciliationTask = null;
  }
  console.log("[Scheduler] Stopped.");
}
