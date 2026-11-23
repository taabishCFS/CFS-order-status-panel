-- How each brand's supplier is paid (credit or pro-forma), set on the Brand terms screen.
CREATE TABLE "BrandTerms" (
  "shop" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "terms" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandTerms_pkey" PRIMARY KEY ("shop", "brand")
);
