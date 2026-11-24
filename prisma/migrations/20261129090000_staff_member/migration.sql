-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_shop_staffId_key" ON "StaffMember"("shop", "staffId");
