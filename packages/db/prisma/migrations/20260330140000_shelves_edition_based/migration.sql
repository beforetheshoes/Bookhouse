-- CreateEnum
CREATE TYPE "ShelfFormatFilter" AS ENUM ('ALL', 'EBOOK', 'AUDIOBOOK');

-- AlterTable: add formatFilter to Collection
ALTER TABLE "Collection" ADD COLUMN "formatFilter" "ShelfFormatFilter" NOT NULL DEFAULT 'ALL';

-- AlterTable: remove preferredSyncEditionId from Work
ALTER TABLE "Work" DROP CONSTRAINT IF EXISTS "Work_preferredSyncEditionId_fkey";
DROP INDEX IF EXISTS "Work_preferredSyncEditionId_key";
ALTER TABLE "Work" DROP COLUMN IF EXISTS "preferredSyncEditionId";

-- DropTable: old CollectionItem (work-based)
DROP TABLE "CollectionItem";

-- CreateTable: new CollectionItem (edition-based)
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_editionId_key" ON "CollectionItem"("collectionId", "editionId");

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
