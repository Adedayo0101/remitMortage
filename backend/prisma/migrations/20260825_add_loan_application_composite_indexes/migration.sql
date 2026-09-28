-- CreateIndex for borrower (applicantId) + status query filtering
CREATE INDEX IF NOT EXISTS "LoanApplication_applicantId_status_idx" ON "LoanApplication"("applicantId", "status");

-- CreateIndex for admin queue filtering and sorting (status + createdAt)
CREATE INDEX IF NOT EXISTS "LoanApplication_status_createdAt_idx" ON "LoanApplication"("status", "createdAt");
