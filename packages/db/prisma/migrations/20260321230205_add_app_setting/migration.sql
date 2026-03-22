-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Edition_isbn10_idx" ON "Edition"("isbn10");

-- CreateIndex
CREATE INDEX "Edition_asin_idx" ON "Edition"("asin");

-- CreateIndex
CREATE INDEX "Edition_formatFamily_idx" ON "Edition"("formatFamily");

-- CreateIndex
CREATE INDEX "Edition_publisher_idx" ON "Edition"("publisher");

-- CreateIndex
CREATE INDEX "Series_name_idx" ON "Series"("name");
