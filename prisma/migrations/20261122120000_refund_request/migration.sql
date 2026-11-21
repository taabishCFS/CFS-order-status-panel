-- Refund requests entered by staff on an order. Accounts act on the list; nothing here moves money.
CREATE TABLE "RefundRequest" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderName" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "lineIds" TEXT[],
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundRequest_shop_clientKey_key" ON "RefundRequest"("shop", "clientKey");
CREATE INDEX "RefundRequest_shop_orderId_idx" ON "RefundRequest"("shop", "orderId");
CREATE INDEX "RefundRequest_shop_status_createdAt_idx" ON "RefundRequest"("shop", "status", "createdAt");
