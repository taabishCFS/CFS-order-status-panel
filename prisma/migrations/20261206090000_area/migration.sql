-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "postcodes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Area_shop_name_key" ON "Area"("shop", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Area_shop_seq_key" ON "Area"("shop", "seq");
