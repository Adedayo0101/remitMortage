import cron from "node-cron";
import { runRepaymentAudit } from "./repaymentAudit.js";

let schedulerTask: ReturnType<typeof cron.schedule> | null = null;

export function startScheduler() {
  if (schedulerTask) {
    console.log("[Scheduler] Already running, ignoring start request.");
    return;
  }

  // Schedule to run every day at UTC midnight. The explicit timezone: "UTC"
  // option prevents node-cron from firing at local-wall-clock midnight, which
  // would shift by ±1 hour across DST transitions on non-UTC servers.
  schedulerTask = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] Triggering repayment audit job...");
    await runRepaymentAudit();
  }, { timezone: "UTC" });

  console.log("[Scheduler] Started: daily repayment audit job scheduled.");
}

export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log("[Scheduler] Stopped.");
  }
}
