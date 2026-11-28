-- Feedback Calling: the day each line was Completed, the review call details per order, and the callers list.
ALTER TABLE "OrderLine" ADD COLUMN "completedDate" TEXT;

CREATE TABLE "FeedbackCall" (
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "callDate" TEXT,
    "staff" TEXT,
    "callStatus" TEXT,
    "remark" TEXT,
    "remark2" TEXT,
    "rating" TEXT,
    "ratingDate" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackCall_pkey" PRIMARY KEY ("shop","orderId")
);
CREATE INDEX "FeedbackCall_shop_staff_idx" ON "FeedbackCall"("shop", "staff");

CREATE TABLE "FeedbackCaller" (
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackCaller_pkey" PRIMARY KEY ("shop","name")
);
