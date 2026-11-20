-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT,
    "email" TEXT,
    "shippingAddress" TEXT,
    "billingAddress" TEXT,
    "financialStatus" TEXT,
    "currency" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "tags" TEXT[],
    "sourceName" TEXT,
    "site" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "sku" TEXT,
    "vendor" TEXT,
    "variantTitle" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "properties" JSONB NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_shop_createdAt_idx" ON "Order"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shop_orderId_key" ON "Order"("shop", "orderId");

-- CreateIndex
CREATE INDEX "OrderLine_shop_orderId_idx" ON "OrderLine"("shop", "orderId");

-- CreateIndex
CREATE INDEX "OrderLine_shop_sku_idx" ON "OrderLine"("shop", "sku");


-- Order data is personal data: block Supabase Data API access. The app connects as the table owner.
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderLine" ENABLE ROW LEVEL SECURITY;
