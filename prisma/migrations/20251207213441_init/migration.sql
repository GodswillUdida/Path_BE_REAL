/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Program` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");
