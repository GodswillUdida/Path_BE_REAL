-- CreateEnum
CREATE TYPE "PendingRegistrationStatus" AS ENUM ('PENDING', 'COMPLETED', 'SUPERSEDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PendingRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "passwordHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    "applicantId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingRegistration_email_status_idx" ON "PendingRegistration"("email", "status");

-- CreateIndex
CREATE INDEX "PendingRegistration_status_expiresAt_idx" ON "PendingRegistration"("status", "expiresAt");
