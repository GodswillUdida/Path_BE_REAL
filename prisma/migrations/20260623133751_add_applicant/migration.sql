/*
  Warnings:

  - You are about to drop the `CheckoutSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MagicLoginToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ApplicantStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "CheckoutSession" DROP CONSTRAINT "CheckoutSession_userId_fkey";

-- DropTable
DROP TABLE "CheckoutSession";

-- DropTable
DROP TABLE "MagicLoginToken";

-- DropEnum
DROP TYPE "CheckoutStatus";

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "ApplicantStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "documents" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);
