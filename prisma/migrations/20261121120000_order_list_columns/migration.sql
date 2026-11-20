-- Order list fields: payment, balance, contact, taker, archive flag and per-line status copies.
ALTER TABLE "Order"
  ADD COLUMN "orderStatusId" INTEGER,
  ADD COLUMN "gateway" TEXT,
  ADD COLUMN "outstandingMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "postcode" TEXT,
  ADD COLUMN "orderTakenBy" TEXT,
  ADD COLUMN "orderSource" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "brands" TEXT[],
  ADD COLUMN "lineStatusIds" INTEGER[];

ALTER TABLE "OrderLine"
  ADD COLUMN "lineStatusId" INTEGER,
  ADD COLUMN "expectedDate" TEXT,
  ADD COLUMN "deliveryOutcome" TEXT,
  ADD COLUMN "orderCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "orderArchived" BOOLEAN NOT NULL DEFAULT false;

UPDATE "OrderLine" l SET "orderCreatedAt" = o."createdAt"
  FROM "Order" o WHERE o."shop" = l."shop" AND o."orderId" = l."orderId";

CREATE INDEX "Order_shop_archivedAt_createdAt_idx" ON "Order"("shop", "archivedAt", "createdAt");
CREATE INDEX "OrderLine_shop_vendor_orderCreatedAt_idx" ON "OrderLine"("shop", "vendor", "orderCreatedAt");
CREATE INDEX "OrderLine_shop_lineStatusId_idx" ON "OrderLine"("shop", "lineStatusId");
