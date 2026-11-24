-- The date each order line last came into stock, read from the status record. Used by the supplier payment reports.
ALTER TABLE "OrderLine" ADD COLUMN "stockedDate" TEXT;
