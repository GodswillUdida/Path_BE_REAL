/*
  Warnings:

  - A unique constraint covering the columns `[courseId,programId,duration]` on the table `CoursePricing` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,courseId,programId,pricingId]` on the table `Enrollment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `courseTitleAtIssuance` to the `Certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "CoursePricing_courseId_duration_key";

-- DropIndex
DROP INDEX "Enrollment_userId_courseId_pricingId_key";

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "courseTitleAtIssuance" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CoursePricing" ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "orderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Program" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Progress" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoursePricing_courseId_programId_duration_key" ON "CoursePricing"("courseId", "programId", "duration");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_programId_pricingId_key" ON "Enrollment"("userId", "courseId", "programId", "pricingId");

-- AddForeignKey
ALTER TABLE "CoursePricing" ADD CONSTRAINT "CoursePricing_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
