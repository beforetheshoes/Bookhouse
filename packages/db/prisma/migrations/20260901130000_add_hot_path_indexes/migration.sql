-- Postgres does not index foreign keys automatically. These columns drive
-- every hash/parse/match job (EditionFile.fileAssetId), every Edition delete
-- cascade (ReadingProgress / CollectionItem / KoboSyncedBook.editionId), the
-- library ORDER BY and A-Z rail (Work.sortTitle), the authors page
-- (Contributor.nameSort), series pages (Work.seriesId) and the duplicate
-- review queries. Idempotent.
CREATE INDEX IF NOT EXISTS "EditionFile_fileAssetId_idx" ON "EditionFile"("fileAssetId");
CREATE INDEX IF NOT EXISTS "ReadingProgress_editionId_idx" ON "ReadingProgress"("editionId");
CREATE INDEX IF NOT EXISTS "CollectionItem_editionId_idx" ON "CollectionItem"("editionId");
CREATE INDEX IF NOT EXISTS "KoboSyncedBook_editionId_idx" ON "KoboSyncedBook"("editionId");
CREATE INDEX IF NOT EXISTS "Work_seriesId_idx" ON "Work"("seriesId");
CREATE INDEX IF NOT EXISTS "Work_sortTitle_idx" ON "Work"("sortTitle");
CREATE INDEX IF NOT EXISTS "Contributor_nameSort_idx" ON "Contributor"("nameSort");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_leftEditionId_idx" ON "DuplicateCandidate"("leftEditionId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_rightEditionId_idx" ON "DuplicateCandidate"("rightEditionId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_leftFileAssetId_idx" ON "DuplicateCandidate"("leftFileAssetId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_rightFileAssetId_idx" ON "DuplicateCandidate"("rightFileAssetId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_status_idx" ON "DuplicateCandidate"("status");

-- Redundant: Tag.nameCanonical is already UNIQUE, and (libraryRootId,
-- availabilityStatus) covers the single-column prefix.
DROP INDEX IF EXISTS "Tag_nameCanonical_idx";
DROP INDEX IF EXISTS "FileAsset_libraryRootId_idx";
