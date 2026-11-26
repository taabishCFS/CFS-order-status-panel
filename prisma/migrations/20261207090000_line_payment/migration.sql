-- CreateTable
CREATE TABLE "LinePayment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "manualCostMinor" INTEGER,
    "dhdCostMinor" INTEGER,
    "batchInvoiceNo" TEXT,
    "paidAt" TIMESTAMP(3),
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinePayment_shop_orderId_idx" ON "LinePayment"("shop", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LinePayment_shop_lineId_key" ON "LinePayment"("shop", "lineId");
