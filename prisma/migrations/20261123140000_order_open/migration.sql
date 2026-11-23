-- Who opened an order's detail page last, shown on Order Detail.
CREATE TABLE "OrderOpen" (
  "shop" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "staffName" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderOpen_pkey" PRIMARY KEY ("shop", "orderId")
);
