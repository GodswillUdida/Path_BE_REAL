/*
  Warnings:

  - The `videoStatus` column on the `Topic` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('QUEUED', 'PROCESSING', 'UPLOADED', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "totalTime" INTEGER;

-- AlterTable
ALTER TABLE "Topic" DROP COLUMN "videoStatus",
ADD COLUMN     "videoStatus" "VideoStatus" NOT NULL DEFAULT 'QUEUED';

-- CreateIndex
CREATE INDEX "Topic_videoStatus_idx" ON "Topic"("videoStatus");
