-- CreateTable
CREATE TABLE "MinervaBrand" (
    "shop" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "discHundredths" INTEGER NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinervaBrand_pkey" PRIMARY KEY ("shop","brand")
);

-- CreateTable
CREATE TABLE "MinervaPayment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "discHundredths" INTEGER NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "paidMinor" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinervaPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MinervaPayment_shop_lineId_key" ON "MinervaPayment"("shop", "lineId");

-- CreateIndex
CREATE INDEX "MinervaPayment_shop_paidAt_idx" ON "MinervaPayment"("shop", "paidAt");
