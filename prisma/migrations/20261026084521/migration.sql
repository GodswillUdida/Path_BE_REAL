/*
  Warnings:

  - You are about to drop the column `courseId` on the `Cart` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `Otp` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,cohortOfferId]` on the table `Cart` will be added. If there are existing duplicate values, this will fail.
  - Made the column `userId` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `codeHash` to the `Otp` table without a default value. This is not possible if the table is not empty.
  - Made the column `userId` on table `Payment` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ALUMNI', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "StudentRegistrationSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'APPLICATION');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "CohortStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CohortMemberSource" AS ENUM ('PURCHASE', 'ADMIN', 'IMPORT');

-- CreateEnum
CREATE TYPE "CohortMemberStatus" AS ENUM ('ACTIVE', 'REMOVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL_STUDENTS', 'TARGETED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STUDENT_REGISTERED', 'ENROLLMENT_GRANTED', 'ANNOUNCEMENT', 'LIVE_SESSION_SCHEDULED', 'LIVE_SESSION_UPDATED', 'LIVE_SESSION_REMINDER', 'LIVE_SESSION_CANCELLED', 'SEAT_CONFIRMED', 'ACCESS_ENDING_SOON', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "LiveSessionProvider" AS ENUM ('ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'JITSI', 'LIVEKIT', 'OTHER');

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecordingSource" AS ENUM ('ZOOM_IMPORT', 'LIVEKIT_EGRESS', 'MANUAL_UPLOAD');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('PURCHASE', 'ADMIN_GRANT', 'COHORT_SEAT');

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_userId_fkey";

-- DropIndex
DROP INDEX "Enrollment_userId_courseId_idx";

-- DropIndex
DROP INDEX "Payment_gatewayEventId_key";

-- DropIndex
DROP INDEX "ProgramCourse_programId_position_key";

-- DropIndex
DROP INDEX "Topic_moduleId_position_key";

-- DropIndex
DROP INDEX "users_email_idx";

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cohortOfferId" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "ApplicantPaper" ADD COLUMN     "courseId" TEXT;

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "courseId",
ADD COLUMN     "cohortOfferId" TEXT,
ALTER COLUMN "pricingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CoursePricing" ADD COLUMN     "bonusDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "cohortId" TEXT,
ADD COLUMN     "grantReason" TEXT,
ADD COLUMN     "grantedById" TEXT,
ADD COLUMN     "source" "EnrollmentSource" NOT NULL DEFAULT 'PURCHASE',
ALTER COLUMN "pricingId" DROP NOT NULL,
ALTER COLUMN "orderItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "bonusDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cohortOfferId" TEXT,
ALTER COLUMN "pricingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Otp" DROP COLUMN "code",
ADD COLUMN     "codeHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "userId" SET NOT NULL;

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentCode" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "registrationSource" "StudentRegistrationSource" NOT NULL DEFAULT 'MANUAL',
    "registeredById" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicantId" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentImportBatch" (
    "id" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "options" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "centre" TEXT,
    "status" "CohortStatus" NOT NULL DEFAULT 'UPCOMING',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortCourse" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortInstructor" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortInstructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortMember" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CohortMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "source" "CohortMemberSource" NOT NULL DEFAULT 'PURCHASE',
    "orderItemId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "chatMutedUntil" TIMESTAMP(3),

    CONSTRAINT "CohortMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'TARGETED',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "sendEmail" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "recipientCount" INTEGER,
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementTarget" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "cohortId" TEXT,
    "courseId" TEXT,

    CONSTRAINT "AnnouncementTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "data" JSONB,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "toAddress" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "hostId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "provider" "LiveSessionProvider" NOT NULL DEFAULT 'GOOGLE_MEET',
    "joinUrl" TEXT,
    "passcode" TEXT,
    "fallbackJoinUrl" TEXT,
    "roomName" TEXT,
    "meetingAccountId" TEXT,
    "listedPublicly" BOOLEAN NOT NULL DEFAULT true,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelledReason" TEXT,
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSessionCohort" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,

    CONSTRAINT "LiveSessionCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortOffer" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "includesCourseAccess" BOOLEAN NOT NULL DEFAULT true,
    "bonusDays" INTEGER NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAccount" (
    "id" TEXT NOT NULL,
    "provider" "LiveSessionProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "accountEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSessionRecording" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "source" "RecordingSource" NOT NULL,
    "sourceRef" TEXT,
    "provider" "VideoProvider" NOT NULL DEFAULT 'BUNNY',
    "providerAssetId" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'QUEUED',
    "durationSeconds" INTEGER,
    "fileSizeBytes" BIGINT,
    "thumbnailUrl" TEXT,
    "providerData" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSessionRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT,
    "courseId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'General',
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "replyToId" TEXT,
    "clientMessageId" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadState" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "paymentId" TEXT,
    "reference" TEXT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_studentCode_key" ON "StudentProfile"("studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_applicantId_key" ON "StudentProfile"("applicantId");

-- CreateIndex
CREATE INDEX "StudentProfile_status_idx" ON "StudentProfile"("status");

-- CreateIndex
CREATE INDEX "StudentProfile_registeredAt_idx" ON "StudentProfile"("registeredAt");

-- CreateIndex
CREATE INDEX "StudentProfile_importBatchId_idx" ON "StudentProfile"("importBatchId");

-- CreateIndex
CREATE INDEX "StudentImportBatch_status_idx" ON "StudentImportBatch"("status");

-- CreateIndex
CREATE INDEX "StudentImportBatch_createdAt_idx" ON "StudentImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "StudentImportBatch_uploadedById_idx" ON "StudentImportBatch"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_slug_key" ON "Cohort"("slug");

-- CreateIndex
CREATE INDEX "Cohort_status_deletedAt_idx" ON "Cohort"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Cohort_centre_idx" ON "Cohort"("centre");

-- CreateIndex
CREATE INDEX "Cohort_startsAt_idx" ON "Cohort"("startsAt");

-- CreateIndex
CREATE INDEX "CohortCourse_courseId_idx" ON "CohortCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortCourse_cohortId_courseId_key" ON "CohortCourse"("cohortId", "courseId");

-- CreateIndex
CREATE INDEX "CohortInstructor_userId_idx" ON "CohortInstructor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortInstructor_cohortId_userId_key" ON "CohortInstructor"("cohortId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortMember_orderItemId_key" ON "CohortMember"("orderItemId");

-- CreateIndex
CREATE INDEX "CohortMember_userId_status_idx" ON "CohortMember"("userId", "status");

-- CreateIndex
CREATE INDEX "CohortMember_cohortId_status_idx" ON "CohortMember"("cohortId", "status");

-- CreateIndex
CREATE INDEX "CohortMember_status_expiresAt_idx" ON "CohortMember"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CohortMember_cohortId_userId_key" ON "CohortMember"("cohortId", "userId");

-- CreateIndex
CREATE INDEX "Announcement_status_scheduledFor_idx" ON "Announcement"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Announcement_status_publishedAt_idx" ON "Announcement"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Announcement_deletedAt_idx" ON "Announcement"("deletedAt");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_cohortId_idx" ON "AnnouncementTarget"("cohortId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_courseId_idx" ON "AnnouncementTarget"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementTarget_announcementId_cohortId_key" ON "AnnouncementTarget"("announcementId", "cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementTarget_announcementId_courseId_key" ON "AnnouncementTarget"("announcementId", "courseId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_refType_refId_idx" ON "Notification"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_providerMessageId_idx" ON "NotificationDelivery"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_roomName_key" ON "LiveSession"("roomName");

-- CreateIndex
CREATE INDEX "LiveSession_status_startsAt_idx" ON "LiveSession"("status", "startsAt");

-- CreateIndex
CREATE INDEX "LiveSession_courseId_idx" ON "LiveSession"("courseId");

-- CreateIndex
CREATE INDEX "LiveSession_hostId_idx" ON "LiveSession"("hostId");

-- CreateIndex
CREATE INDEX "LiveSession_meetingAccountId_startsAt_idx" ON "LiveSession"("meetingAccountId", "startsAt");

-- CreateIndex
CREATE INDEX "LiveSessionCohort_cohortId_sessionId_idx" ON "LiveSessionCohort"("cohortId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionCohort_sessionId_cohortId_key" ON "LiveSessionCohort"("sessionId", "cohortId");

-- CreateIndex
CREATE INDEX "CohortOffer_cohortId_isActive_idx" ON "CohortOffer"("cohortId", "isActive");

-- CreateIndex
CREATE INDEX "CohortOffer_isActive_closesAt_idx" ON "CohortOffer"("isActive", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAccount_provider_label_key" ON "MeetingAccount"("provider", "label");

-- CreateIndex
CREATE INDEX "LiveSessionRecording_status_idx" ON "LiveSessionRecording"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionRecording_sessionId_sourceRef_key" ON "LiveSessionRecording"("sessionId", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionRecording_provider_providerAssetId_key" ON "LiveSessionRecording"("provider", "providerAssetId");

-- CreateIndex
CREATE INDEX "ChatRoom_cohortId_isArchived_idx" ON "ChatRoom"("cohortId", "isArchived");

-- CreateIndex
CREATE INDEX "ChatRoom_courseId_isArchived_idx" ON "ChatRoom"("courseId", "isArchived");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_id_idx" ON "ChatMessage"("roomId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_roomId_senderId_clientMessageId_key" ON "ChatMessage"("roomId", "senderId", "clientMessageId");

-- CreateIndex
CREATE INDEX "ChatReadState_userId_idx" ON "ChatReadState"("userId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_reference_idx" ON "PaymentEvent"("reference");

-- CreateIndex
CREATE INDEX "PaymentEvent_processedAt_receivedAt_idx" ON "PaymentEvent"("processedAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_gateway_eventId_key" ON "PaymentEvent"("gateway", "eventId");

-- CreateIndex
CREATE INDEX "Applicant_userId_idx" ON "Applicant"("userId");

-- CreateIndex
CREATE INDEX "Applicant_cohortOfferId_idx" ON "Applicant"("cohortOfferId");

-- CreateIndex
CREATE INDEX "ApplicantPaper_courseId_idx" ON "ApplicantPaper"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_cohortOfferId_key" ON "Cart"("userId", "cohortOfferId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_idx" ON "Enrollment"("userId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_source_idx" ON "Enrollment"("source");

-- CreateIndex
CREATE INDEX "Enrollment_grantedById_idx" ON "Enrollment"("grantedById");

-- CreateIndex
CREATE INDEX "Enrollment_cohortId_idx" ON "Enrollment"("cohortId");

-- CreateIndex
CREATE INDEX "OrderItem_cohortOfferId_idx" ON "OrderItem"("cohortOfferId");

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_cohortOfferId_fkey" FOREIGN KEY ("cohortOfferId") REFERENCES "CohortOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicantPaper" ADD CONSTRAINT "ApplicantPaper_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "StudentImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortCourse" ADD CONSTRAINT "CohortCourse_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortCourse" ADD CONSTRAINT "CohortCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortInstructor" ADD CONSTRAINT "CohortInstructor_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortInstructor" ADD CONSTRAINT "CohortInstructor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortMember" ADD CONSTRAINT "CohortMember_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortMember" ADD CONSTRAINT "CohortMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortMember" ADD CONSTRAINT "CohortMember_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_meetingAccountId_fkey" FOREIGN KEY ("meetingAccountId") REFERENCES "MeetingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionCohort" ADD CONSTRAINT "LiveSessionCohort_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionCohort" ADD CONSTRAINT "LiveSessionCohort_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortOffer" ADD CONSTRAINT "CohortOffer_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionRecording" ADD CONSTRAINT "LiveSessionRecording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_cohortOfferId_fkey" FOREIGN KEY ("cohortOfferId") REFERENCES "CohortOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_cohortOfferId_fkey" FOREIGN KEY ("cohortOfferId") REFERENCES "CohortOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
