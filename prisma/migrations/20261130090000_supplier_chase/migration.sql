-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "email" TEXT,
    "cc" TEXT,
    "handOrdered" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineChase" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lastChasedAt" TIMESTAMP(3) NOT NULL,
    "chasedByName" TEXT,

    CONSTRAINT "LineChase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierContact_shop_brand_key" ON "SupplierContact"("shop", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "LineChase_shop_lineId_key" ON "LineChase"("shop", "lineId");

-- CreateIndex
CREATE INDEX "LineChase_shop_orderId_idx" ON "LineChase"("shop", "orderId");
