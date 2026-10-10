/*
  Warnings:

  - The values [PDF,EXCEL,WORD,TEMPLATE] on the enum `ResourceType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[moduleId,position]` on the table `Topic` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `storageKey` to the `TopicResource` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `TopicResource` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ResourceType_new" AS ENUM ('FILE', 'LINK');
ALTER TABLE "TopicResource" ALTER COLUMN "type" TYPE "ResourceType_new" USING ("type"::text::"ResourceType_new");
ALTER TYPE "ResourceType" RENAME TO "ResourceType_old";
ALTER TYPE "ResourceType_new" RENAME TO "ResourceType";
DROP TYPE "public"."ResourceType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "TopicResource" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "storageKey" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "url" DROP NOT NULL,
ALTER COLUMN "sizeBytes" SET DATA TYPE BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "Topic_moduleId_position_key" ON "Topic"("moduleId", "position");
