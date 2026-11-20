-- Product and variant ids on each line, so exports can look up cost and collections in Shopify.
ALTER TABLE "OrderLine"
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "variantId" TEXT;
