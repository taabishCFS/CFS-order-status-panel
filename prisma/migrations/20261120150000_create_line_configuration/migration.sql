-- CreateTable
CREATE TABLE "LineConfiguration" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "deltaMinor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "adjustment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineConfiguration_shop_lineItemId_version_key" ON "LineConfiguration"("shop", "lineItemId", "version");

-- CreateIndex
CREATE INDEX "LineConfiguration_shop_orderId_idx" ON "LineConfiguration"("shop", "orderId");

-- Order data is personal data: block Supabase Data API access. The app connects as the table owner.
ALTER TABLE "LineConfiguration" ENABLE ROW LEVEL SECURITY;
