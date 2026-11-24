-- CreateTable
CREATE TABLE "FreeStock" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'freeStock',
    "sourceOrder" TEXT,
    "brand" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "costMinor" INTEGER,
    "warehouseCode" TEXT,
    "rma" TEXT,
    "remarks" TEXT,
    "creditFoc" TEXT,
    "status" TEXT,
    "collection" TEXT,
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeStock_shop_itemType_qty_idx" ON "FreeStock"("shop", "itemType", "qty");

-- CreateIndex
CREATE INDEX "FreeStock_shop_brand_productCode_idx" ON "FreeStock"("shop", "brand", "productCode");
