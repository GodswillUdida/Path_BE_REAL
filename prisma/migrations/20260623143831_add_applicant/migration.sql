/*
  Warnings:

  - You are about to drop the column `metadata` on the `Applicant` table. All the data in the column will be lost.
  - Added the required column `address` to the `Applicant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isNewStudent` to the `Applicant` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `Applicant` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `Applicant` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Applicant" DROP COLUMN "metadata",
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "careerChallenges" TEXT,
ADD COLUMN     "isNewStudent" BOOLEAN NOT NULL,
ADD COLUMN     "lectureCenter" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "previousCenter" TEXT,
ADD COLUMN     "referredBy" TEXT,
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL;

-- CreateTable
CREATE TABLE "ApplicantPaper" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "paperName" TEXT NOT NULL,

    CONSTRAINT "ApplicantPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentInfo" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "placeOfWork" TEXT,
    "position" TEXT,

    CONSTRAINT "EmploymentInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorInfo" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "workplace" TEXT,

    CONSTRAINT "SponsorInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentInfo_applicantId_key" ON "EmploymentInfo"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorInfo_applicantId_key" ON "SponsorInfo"("applicantId");

-- AddForeignKey
ALTER TABLE "ApplicantPaper" ADD CONSTRAINT "ApplicantPaper_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentInfo" ADD CONSTRAINT "EmploymentInfo_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorInfo" ADD CONSTRAINT "SponsorInfo_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
