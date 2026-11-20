-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT,
    "from" TEXT NOT NULL,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "mode" TEXT,
    "providerId" TEXT,
    "error" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_shop_dedupeKey_key" ON "EmailOutbox"("shop", "dedupeKey");

-- CreateIndex
CREATE INDEX "EmailOutbox_shop_orderId_idx" ON "EmailOutbox"("shop", "orderId");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");

-- Emails hold customer addresses and order details: block Supabase Data API access. The app connects as the table owner.
ALTER TABLE "EmailOutbox" ENABLE ROW LEVEL SECURITY;
