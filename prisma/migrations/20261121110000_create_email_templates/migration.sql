-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplateVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSite" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "serviceEmail" TEXT NOT NULL,
    "deliveriesEmail" TEXT NOT NULL,
    "accountsEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "deliveriesFromName" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,

    CONSTRAINT "EmailSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_shop_key_key" ON "EmailTemplate"("shop", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateVersion_shop_key_version_key" ON "EmailTemplateVersion"("shop", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSite_shop_code_key" ON "EmailSite"("shop", "code");

-- Block Supabase Data API access. The app connects as the table owner.
ALTER TABLE "EmailTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailTemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailSite" ENABLE ROW LEVEL SECURITY;
