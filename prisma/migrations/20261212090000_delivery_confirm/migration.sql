-- The customer's delivery confirmation link on each booked line.
ALTER TABLE "DeliveryBooking" ADD COLUMN "confirmToken" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN "confirmNote" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN "confirmedAt" TIMESTAMP(3);
CREATE INDEX "DeliveryBooking_confirmToken_idx" ON "DeliveryBooking"("confirmToken");
