-- Rename the existing AuditLog table
ALTER TABLE "AuditLog" RENAME TO "AuditLog_old";

-- Create the new partitioned AuditLog table
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorAddress" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Create indexes on the new partitioned table
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_actorAddress_idx" ON "AuditLog"("actorAddress");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- Create a partition for the current month and the next month
DO $$
DECLARE
    current_month DATE := date_trunc('month', CURRENT_DATE);
    next_month DATE := current_month + INTERVAL '1 month';
    next_next_month DATE := next_month + INTERVAL '1 month';
BEGIN
    EXECUTE format('CREATE TABLE "AuditLog_%s" PARTITION OF "AuditLog" FOR VALUES FROM (%L) TO (%L)',
        to_char(current_month, 'YYYY_MM'), current_month, next_month);
    
    EXECUTE format('CREATE TABLE "AuditLog_%s" PARTITION OF "AuditLog" FOR VALUES FROM (%L) TO (%L)',
        to_char(next_month, 'YYYY_MM'), next_month, next_next_month);
END $$;

-- Create a default partition for older records if needed
CREATE TABLE "AuditLog_default" PARTITION OF "AuditLog" DEFAULT;

-- Copy data from the old table
INSERT INTO "AuditLog" ("id", "action", "actorAddress", "ipAddress", "metadata", "createdAt")
SELECT "id", "action", "actorAddress", "ipAddress", "metadata", "createdAt" FROM "AuditLog_old";

-- Drop the old table
DROP TABLE "AuditLog_old";
