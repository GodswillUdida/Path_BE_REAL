/*
  Warnings:

  - You are about to alter the column `price` on the `Cart` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - The `level` column on the `Course` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `price` on the `CoursePricing` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - The `durationDays` column on the `CoursePricing` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `totalAmount` on the `Order` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `unitPrice` on the `OrderItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `price` on the `Program` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - Changed the type of `gateway` on the `Payment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'STRIPE');

-- AlterEnum
ALTER TYPE "CourseLevel" ADD VALUE 'PROFESSIONAL';

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropIndex
DROP INDEX "Topic_bunnyVideoId_moduleId_position_idx";

-- AlterTable
ALTER TABLE "Cart" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "level",
ADD COLUMN     "level" "CourseLevel" NOT NULL DEFAULT 'BEGINNER';

-- AlterTable
ALTER TABLE "CoursePricing" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2),
DROP COLUMN "durationDays",
ADD COLUMN     "durationDays" "CoursePricingDuration" NOT NULL DEFAULT 'THIRTY_DAYS';

-- AlterTable
ALTER TABLE "Module" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "rawPayload" JSONB,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2),
DROP COLUMN "gateway",
ADD COLUMN     "gateway" "PaymentGateway" NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Program" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- DropEnum
DROP TYPE "CourseCategory";

-- DropEnum
DROP TYPE "RequestStatus";

-- CreateIndex
CREATE INDEX "Course_instructorId_idx" ON "Course"("instructorId");

-- CreateIndex
CREATE INDEX "Course_status_deletedAt_idx" ON "Course"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "CoursePricing_courseId_isActive_idx" ON "CoursePricing"("courseId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePricing_courseId_durationDays_key" ON "CoursePricing"("courseId", "durationDays");

-- CreateIndex
CREATE INDEX "Enrollment_orderId_idx" ON "Enrollment"("orderId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE INDEX "Otp_expiresAt_idx" ON "Otp"("expiresAt");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_enrollmentId_idx" ON "Payment"("enrollmentId");

-- CreateIndex
CREATE INDEX "Program_status_deletedAt_idx" ON "Program"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Topic_moduleId_deletedAt_createdAt_idx" ON "Topic"("moduleId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
