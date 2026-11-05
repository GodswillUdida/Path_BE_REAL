-- DropIndex
DROP INDEX "sessions_revokedAt_idx";

-- DropIndex
DROP INDEX "sessions_userId_idx";

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");
