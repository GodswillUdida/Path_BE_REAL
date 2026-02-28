/*
  Warnings:

  - You are about to drop the column `videoUrl` on the `Topic` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[bunnyVideoId]` on the table `Topic` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Topic` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Topic_slug_moduleId_position_idx";

-- AlterTable
ALTER TABLE "Topic" DROP COLUMN "videoUrl",
ADD COLUMN     "bunnyVideoId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "videoStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Topic_bunnyVideoId_key" ON "Topic"("bunnyVideoId");

-- CreateIndex
CREATE INDEX "Topic_moduleId_position_idx" ON "Topic"("moduleId", "position");
