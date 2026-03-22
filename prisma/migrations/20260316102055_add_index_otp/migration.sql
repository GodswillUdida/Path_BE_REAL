-- DropIndex
DROP INDEX "Otp_email_idx";

-- CreateIndex
CREATE INDEX "Otp_email_expiresAt_idx" ON "Otp"("email", "expiresAt");
