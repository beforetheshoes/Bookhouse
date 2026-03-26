-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameCanonical" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTag" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "WorkTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_nameCanonical_key" ON "Tag"("nameCanonical");

-- CreateIndex
CREATE INDEX "Tag_nameCanonical_idx" ON "Tag"("nameCanonical");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTag_workId_tagId_key" ON "WorkTag"("workId", "tagId");

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
