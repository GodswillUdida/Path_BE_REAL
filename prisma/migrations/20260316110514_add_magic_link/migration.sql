-- CreateTable
CREATE TABLE "MagicLoginToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MagicLoginToken_email_idx" ON "MagicLoginToken"("email");
