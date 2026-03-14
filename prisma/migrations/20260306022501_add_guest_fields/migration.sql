-- Step 1: Add columns as nullable
ALTER TABLE "Order" ADD COLUMN "email" TEXT;
ALTER TABLE "Order" ADD COLUMN "updatedAt" TIMESTAMP;

ALTER TABLE "OrderItem" ADD COLUMN "unitPrice" FLOAT;

-- Step 2: Backfill existing rows
UPDATE "Order" SET email = 'unknown@example.com' WHERE email IS NULL;
UPDATE "Order" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE "OrderItem" SET "unitPrice" = 0 WHERE "unitPrice" IS NULL;

-- Step 3: Make columns NOT NULL
ALTER TABLE "Order" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" SET NOT NULL;