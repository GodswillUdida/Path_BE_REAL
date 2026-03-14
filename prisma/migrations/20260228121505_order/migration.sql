-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "quantity" SET DEFAULT 1;

-- CreateIndex
CREATE INDEX "OrderItem_pricingId_idx" ON "OrderItem"("pricingId");
