-- Returned Items: the cancel reason on each mirrored line, and the action taken with returned goods.
ALTER TABLE "OrderLine" ADD COLUMN "cancelReason" TEXT;

CREATE TABLE "LineReturnAction" (
    "shop" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "byName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineReturnAction_pkey" PRIMARY KEY ("shop","lineId")
);
