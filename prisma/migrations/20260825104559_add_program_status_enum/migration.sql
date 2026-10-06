/*
  Warnings:

  - You are about to drop the column `duration` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `programId` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `durationDays` on the `CoursePricing` table. All the data in the column will be lost.
  - You are about to drop the column `isLifetime` on the `Enrollment` table. All the data in the column will be lost.
  - You are about to drop the column `paymentRef` on the `Enrollment` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `Enrollment` table. All the data in the column will be lost.
  - You are about to drop the column `totalTime` on the `Module` table. All the data in the column will be lost.
  - You are about to drop the column `enrollmentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Program` table. All the data in the column will be lost.
  - The `status` column on the `Program` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `bunnyVideoId` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `fileSizeBytes` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `idempotencyKey` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `resources` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnailUrl` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `videoHeight` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `videoStatus` on the `Topic` table. All the data in the column will be lost.
  - You are about to drop the column `videoWidth` on the `Topic` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `Course` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,courseId]` on the table `Enrollment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId,slug]` on the table `Module` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gatewayEventId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[moduleId,slug]` on the table `Topic` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Course` table without a default value. This is not possible if the table is not empty.
  - Made the column `durationSeconds` on table `Topic` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VideoProvider" AS ENUM ('BUNNY', 'AWS', 'CLOUDFLARE', 'MUX');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'EXCEL', 'WORD', 'TEMPLATE', 'LINK');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- DropForeignKey
ALTER TABLE "Certificate" DROP CONSTRAINT "Certificate_enrollmentId_fkey";

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_programId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_enrollmentId_fkey";

-- DropIndex
DROP INDEX "Course_programId_idx";

-- DropIndex
DROP INDEX "CoursePricing_courseId_durationDays_key";

-- DropIndex
DROP INDEX "Enrollment_expiresAt_idx";

-- DropIndex
DROP INDEX "Enrollment_userId_courseId_pricingId_key";

-- DropIndex
DROP INDEX "Module_slug_key";

-- DropIndex
DROP INDEX "Payment_enrollmentId_idx";

-- DropIndex
DROP INDEX "Topic_bunnyVideoId_key";

-- DropIndex
DROP INDEX "Topic_idempotencyKey_key";

-- DropIndex
DROP INDEX "Topic_moduleId_deletedAt_createdAt_idx";

-- DropIndex
DROP INDEX "Topic_slug_key";

-- DropIndex
DROP INDEX "Topic_videoStatus_idx";

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "duration",
DROP COLUMN "programId",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "issuesCertificate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalDurationSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CoursePricing" DROP COLUMN "durationDays",
ADD COLUMN     "accessDurationDays" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Enrollment" DROP COLUMN "isLifetime",
DROP COLUMN "paymentRef",
DROP COLUMN "paymentStatus",
ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Module" DROP COLUMN "totalTime",
ADD COLUMN     "totalDurationSeconds" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "slug" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "enrollmentId",
ADD COLUMN     "gatewayEventId" TEXT;

-- AlterTable
ALTER TABLE "Program" DROP COLUMN "currency",
DROP COLUMN "price",
DROP COLUMN "status",
ADD COLUMN     "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Progress" ADD COLUMN     "watchedRanges" JSONB DEFAULT '[]';

-- AlterTable
ALTER TABLE "Topic" DROP COLUMN "bunnyVideoId",
DROP COLUMN "fileSizeBytes",
DROP COLUMN "idempotencyKey",
DROP COLUMN "resources",
DROP COLUMN "thumbnailUrl",
DROP COLUMN "videoHeight",
DROP COLUMN "videoStatus",
DROP COLUMN "videoWidth",
ALTER COLUMN "durationSeconds" SET NOT NULL,
ALTER COLUMN "durationSeconds" SET DEFAULT 0;

-- DropEnum
DROP TYPE "CoursePricingDuration";

-- CreateTable
CREATE TABLE "ProgramCourse" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "provider" "VideoProvider" NOT NULL DEFAULT 'BUNNY',
    "providerAssetId" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'QUEUED',
    "durationSeconds" INTEGER,
    "thumbnailUrl" TEXT,
    "fileSizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "providerData" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicResource" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramCourse_programId_position_idx" ON "ProgramCourse"("programId", "position");

-- CreateIndex
CREATE INDEX "ProgramCourse_courseId_idx" ON "ProgramCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCourse_programId_courseId_key" ON "ProgramCourse"("programId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCourse_programId_position_key" ON "ProgramCourse"("programId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_topicId_key" ON "VideoAsset"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_idempotencyKey_key" ON "VideoAsset"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VideoAsset_status_idx" ON "VideoAsset"("status");

-- CreateIndex
CREATE INDEX "VideoAsset_provider_idx" ON "VideoAsset"("provider");

-- CreateIndex
CREATE INDEX "VideoAsset_providerAssetId_idx" ON "VideoAsset"("providerAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_provider_providerAssetId_key" ON "VideoAsset"("provider", "providerAssetId");

-- CreateIndex
CREATE INDEX "TopicResource_topicId_position_idx" ON "TopicResource"("topicId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "Course_title_idx" ON "Course"("title");

-- CreateIndex
CREATE INDEX "Course_code_idx" ON "Course"("code");

-- CreateIndex
CREATE INDEX "CoursePricing_courseId_accessDurationDays_idx" ON "CoursePricing"("courseId", "accessDurationDays");

-- CreateIndex
CREATE INDEX "CoursePricing_courseId_sortOrder_idx" ON "CoursePricing"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Enrollment_status_expiresAt_idx" ON "Enrollment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "Module_courseId_deletedAt_idx" ON "Module"("courseId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Module_courseId_slug_key" ON "Module"("courseId", "slug");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayEventId_key" ON "Payment"("gatewayEventId");

-- CreateIndex
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_gateway_status_createdAt_idx" ON "Payment"("gateway", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Program_status_deletedAt_idx" ON "Program"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Topic_moduleId_deletedAt_position_idx" ON "Topic"("moduleId", "deletedAt", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_moduleId_slug_key" ON "Topic"("moduleId", "slug");

-- AddForeignKey
ALTER TABLE "ProgramCourse" ADD CONSTRAINT "ProgramCourse_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCourse" ADD CONSTRAINT "ProgramCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicResource" ADD CONSTRAINT "TopicResource_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
