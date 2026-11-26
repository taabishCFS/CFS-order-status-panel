-- CreateTable
CREATE TABLE "PayListLine" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayListLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayListLine_shop_staffId_createdAt_idx" ON "PayListLine"("shop", "staffId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayListLine_shop_lineId_key" ON "PayListLine"("shop", "lineId");
