-- DropIndex
DROP INDEX "Otp_email_code_key";

-- DropIndex
DROP INDEX "Otp_email_expiresAt_idx";

-- AlterTable
ALTER TABLE "Otp" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Otp_email_idx" ON "Otp"("email");
