/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `Topic` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Topic_idempotencyKey_key" ON "Topic"("idempotencyKey");
