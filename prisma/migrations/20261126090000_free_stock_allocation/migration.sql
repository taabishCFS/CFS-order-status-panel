-- Free stock given to an order line. Stock that has been given out cannot be deleted.
CREATE TABLE "FreeStockAllocation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "freeStockId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCostMinor" INTEGER,
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeStockAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FreeStockAllocation_shop_orderId_idx" ON "FreeStockAllocation"("shop", "orderId");

CREATE INDEX "FreeStockAllocation_shop_lineId_idx" ON "FreeStockAllocation"("shop", "lineId");

CREATE INDEX "FreeStockAllocation_freeStockId_idx" ON "FreeStockAllocation"("freeStockId");

ALTER TABLE "FreeStockAllocation" ADD CONSTRAINT "FreeStockAllocation_freeStockId_fkey" FOREIGN KEY ("freeStockId") REFERENCES "FreeStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
