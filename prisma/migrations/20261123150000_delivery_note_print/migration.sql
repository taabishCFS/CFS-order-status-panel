-- Each time staff open a delivery note for printing: the delivery notes log on Order Detail.
CREATE TABLE "DeliveryNotePrint" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "printedById" TEXT NOT NULL,
  "printedBy" TEXT NOT NULL,
  "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeliveryNotePrint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryNotePrint_shop_orderId_printedAt_idx" ON "DeliveryNotePrint"("shop", "orderId", "printedAt");
