-- Supplier invoice details per order line (date, number, amount, paid), entered by staff.
CREATE TABLE "LineSupplierInvoice" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "invoiceDate" TEXT,
  "invoiceNumber" TEXT,
  "amountMinor" INTEGER,
  "paid" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LineSupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineSupplierInvoice_shop_lineId_key" ON "LineSupplierInvoice"("shop", "lineId");
CREATE INDEX "LineSupplierInvoice_shop_orderId_idx" ON "LineSupplierInvoice"("shop", "orderId");
