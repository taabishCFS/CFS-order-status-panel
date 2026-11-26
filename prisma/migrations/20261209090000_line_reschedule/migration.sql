-- CreateTable
CREATE TABLE "LineReschedule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "chargeMinor" INTEGER NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineReschedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineReschedule_shop_lineId_key" ON "LineReschedule"("shop", "lineId");

-- CreateIndex
CREATE INDEX "LineReschedule_shop_updatedAt_idx" ON "LineReschedule"("shop", "updatedAt");
