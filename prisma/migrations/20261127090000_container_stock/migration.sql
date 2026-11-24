-- CreateTable
CREATE TABLE "ContainerStock" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "sku" TEXT,
    "itemVendor" TEXT NOT NULL,
    "containerRange" TEXT,
    "containerNo" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "warehouseCode" TEXT,
    "costDollarMinor" INTEGER,
    "costMinor" INTEGER,
    "priceMinor" INTEGER,
    "delvCostMinor" INTEGER,
    "addedQty" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "totalCbm" DOUBLE PRECISION,
    "expectedDate" TIMESTAMP(3),
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerAllocation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "containerStockId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCostMinor" INTEGER,
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerFreight" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "itemVendor" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "freightMinor" INTEGER NOT NULL,
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerFreight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContainerStock_shop_containerNo_idx" ON "ContainerStock"("shop", "containerNo");
CREATE INDEX "ContainerStock_shop_productCode_idx" ON "ContainerStock"("shop", "productCode");
CREATE INDEX "ContainerStock_shop_qty_idx" ON "ContainerStock"("shop", "qty");
CREATE INDEX "ContainerAllocation_shop_orderId_idx" ON "ContainerAllocation"("shop", "orderId");
CREATE INDEX "ContainerAllocation_shop_lineId_idx" ON "ContainerAllocation"("shop", "lineId");
CREATE INDEX "ContainerAllocation_containerStockId_idx" ON "ContainerAllocation"("containerStockId");
CREATE INDEX "ContainerFreight_shop_containerNo_idx" ON "ContainerFreight"("shop", "containerNo");

-- AddForeignKey
ALTER TABLE "ContainerAllocation" ADD CONSTRAINT "ContainerAllocation_containerStockId_fkey" FOREIGN KEY ("containerStockId") REFERENCES "ContainerStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
