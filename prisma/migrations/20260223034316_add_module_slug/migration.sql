/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Module` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Topic` will be added. If there are existing duplicate values, this will fail.
  - Made the column `description` on table `Program` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `slug` to the `Topic` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'CONTACTED', 'REGISTERED', 'REJECTED');

-- DropIndex
DROP INDEX "Topic_moduleId_position_idx";

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "completions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "slug" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Program" ALTER COLUMN "description" SET NOT NULL;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Module_slug_key" ON "Module"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- CreateIndex
CREATE INDEX "Topic_slug_moduleId_position_idx" ON "Topic"("slug", "moduleId", "position");

-- CreateIndex
CREATE INDEX "users_verificationToken_idx" ON "users"("verificationToken");
