/*
  Warnings:

  - The values [FILE] on the enum `ResourceType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to alter the column `sizeBytes` on the `TopicResource` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "ResourceType_new" AS ENUM ('PDF', 'EXCEL', 'WORD', 'TEMPLATE', 'LINK');
ALTER TABLE "TopicResource" ALTER COLUMN "type" TYPE "ResourceType_new" USING ("type"::text::"ResourceType_new");
ALTER TYPE "ResourceType" RENAME TO "ResourceType_old";
ALTER TYPE "ResourceType_new" RENAME TO "ResourceType";
DROP TYPE "public"."ResourceType_old";
COMMIT;

-- AlterTable
ALTER TABLE "TopicResource" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ResourceStatus" NOT NULL DEFAULT 'QUEUED',
ALTER COLUMN "sizeBytes" SET DATA TYPE INTEGER,
ALTER COLUMN "storageKey" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "TopicResource_status_idx" ON "TopicResource"("status");
