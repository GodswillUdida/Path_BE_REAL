-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "isLifetime" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Progress" ADD COLUMN     "duration" INTEGER;
