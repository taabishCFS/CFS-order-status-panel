-- AlterTable
ALTER TABLE "SupplierContact" ADD COLUMN "address" TEXT;

-- CreateTable
CREATE TABLE "SupplierCollection" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "vanId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierCollection_shop_createdAt_idx" ON "SupplierCollection"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCollection_shop_brand_vanId_date_key" ON "SupplierCollection"("shop", "brand", "vanId", "date");
