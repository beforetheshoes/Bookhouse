ALTER TABLE "CollectionItem"
ADD COLUMN "workId" TEXT;

UPDATE "CollectionItem" AS ci
SET "workId" = e."workId"
FROM "Edition" AS e
WHERE ci."editionId" = e."id";

DELETE FROM "CollectionItem" AS ci
USING "CollectionItem" AS duplicate
WHERE ci."id" > duplicate."id"
  AND ci."collectionId" = duplicate."collectionId"
  AND ci."workId" = duplicate."workId";

ALTER TABLE "CollectionItem"
ALTER COLUMN "workId" SET NOT NULL;

ALTER TABLE "CollectionItem"
DROP CONSTRAINT "CollectionItem_editionId_fkey";

DROP INDEX "CollectionItem_collectionId_editionId_key";

ALTER TABLE "CollectionItem"
DROP COLUMN "editionId";

ALTER TABLE "CollectionItem"
ADD CONSTRAINT "CollectionItem_workId_fkey"
FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CollectionItem_collectionId_workId_key"
ON "CollectionItem"("collectionId", "workId");
