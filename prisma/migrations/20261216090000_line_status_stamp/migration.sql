-- Service Issue Orders: when and by whom each line got its current status, and the Service Issue remarks.
ALTER TABLE "OrderLine" ADD COLUMN "statusAt" TIMESTAMP(3);
ALTER TABLE "OrderLine" ADD COLUMN "statusBy" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "serviceRemarks" TEXT;
