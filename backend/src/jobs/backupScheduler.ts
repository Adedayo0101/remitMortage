import cron from "node-cron";
import { createBackupService } from "../services/databaseBackup.js";
import logger from "../utils/logger.js";

/**
 * Automated Database Backup Scheduler
 *
 * Runs daily backups at 2:00 AM UTC by default.
 * Schedule can be customized via BACKUP_CRON_SCHEDULE environment variable.
 */
export function startBackupScheduler(): void {
  // Default: Daily at 2:00 AM UTC
  // Format: minute hour day month weekday
  const schedule = process.env.BACKUP_CRON_SCHEDULE || "0 2 * * *";

  const enabled = process.env.ENABLE_AUTO_BACKUP !== "false";

  if (!enabled) {
    logger.info("Automated database backups are disabled");
    return;
  }

  logger.info("Starting automated backup scheduler", {
    schedule,
    timezone: "UTC",
  });

  cron.schedule(
    schedule,
    async () => {
      logger.info("Executing scheduled database backup");

      try {
        const backupService = createBackupService();
        const result = await backupService.executeBackup();

        logger.info("Scheduled backup completed successfully", {
          backupKey: result.backupKey,
          sizeBytes: result.size,
          sizeMB: (result.size / (1024 * 1024)).toFixed(2),
        });
      } catch (error) {
        logger.error("Scheduled backup failed", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        // TODO: Send alert notification (email, Slack, PagerDuty, etc.)
        // await sendBackupFailureAlert(error);
      }
    },
    {
      timezone: "UTC",
    }
  );

  logger.info("Backup scheduler started successfully");
}

/**
 * Execute an immediate backup (for testing or manual trigger)
 */
export async function executeImmediateBackup(): Promise<void> {
  logger.info("Executing immediate database backup");

  const backupService = createBackupService();
  const result = await backupService.executeBackup();

  logger.info("Immediate backup completed", {
    backupKey: result.backupKey,
    sizeMB: (result.size / (1024 * 1024)).toFixed(2),
  });
}
