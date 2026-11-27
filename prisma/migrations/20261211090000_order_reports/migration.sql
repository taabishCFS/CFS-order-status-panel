-- Order Reports: coupon codes and delivery service charges on the saved order.
ALTER TABLE "Order" ADD COLUMN "discountCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Order" ADD COLUMN "serviceMinor" JSONB NOT NULL DEFAULT '{}';
