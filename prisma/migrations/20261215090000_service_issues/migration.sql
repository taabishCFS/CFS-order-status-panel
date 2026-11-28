-- Service Issue Report: the staff-kept log of service issues (legacy service_issue_report).
CREATE TABLE "ServiceIssue" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "raisedDate" TEXT,
    "expectedDate" TEXT,
    "orderNo" TEXT,
    "brand" TEXT,
    "item" TEXT,
    "code" TEXT,
    "remark" TEXT,
    "qty" INTEGER,
    "process" TEXT,
    "chargeable" TEXT,
    "amount" TEXT,
    "supplierOffered" TEXT,
    "status" TEXT,
    "rma" TEXT,
    "mdTd" TEXT,
    "cost" TEXT,
    "price" TEXT,
    "discount" TEXT,
    "finalPrice" TEXT,
    "van" TEXT,
    "containerNo" TEXT,
    "takenBy" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceIssue_shop_raisedDate_idx" ON "ServiceIssue"("shop", "raisedDate");
CREATE INDEX "ServiceIssue_shop_code_idx" ON "ServiceIssue"("shop", "code");
