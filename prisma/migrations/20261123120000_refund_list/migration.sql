-- The accounts refund list (legacy Refund Orders List): the transaction id, who refunded and when, the claimable flag, manual adds and removals.
ALTER TABLE "RefundRequest" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "RefundRequest" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "RefundRequest" ADD COLUMN "refundedByName" TEXT;
ALTER TABLE "RefundRequest" ADD COLUMN "claimable" TEXT;
ALTER TABLE "RefundRequest" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RefundRequest" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "RefundRequest" ADD COLUMN "removedByName" TEXT;
