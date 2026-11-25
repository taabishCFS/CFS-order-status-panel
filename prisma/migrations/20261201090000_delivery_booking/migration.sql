-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Van" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reg" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Van_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySlot" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryBooking" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "vanId" TEXT,
    "driverId" TEXT,
    "drop" INTEGER,
    "amPm" TEXT,
    "slotId" TEXT,
    "bookedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryHistory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "date" TEXT,
    "vanName" TEXT,
    "driverName" TEXT,
    "drop" INTEGER,
    "amPm" TEXT,
    "reason" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_shop_name_key" ON "Driver"("shop", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Van_shop_name_key" ON "Van"("shop", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySlot_shop_label_key" ON "DeliverySlot"("shop", "label");

-- CreateIndex
CREATE INDEX "DeliveryBooking_shop_orderId_idx" ON "DeliveryBooking"("shop", "orderId");

-- CreateIndex
CREATE INDEX "DeliveryBooking_shop_date_vanId_drop_idx" ON "DeliveryBooking"("shop", "date", "vanId", "drop");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryBooking_shop_lineId_key" ON "DeliveryBooking"("shop", "lineId");

-- CreateIndex
CREATE INDEX "DeliveryHistory_shop_orderId_createdAt_idx" ON "DeliveryHistory"("shop", "orderId", "createdAt");

