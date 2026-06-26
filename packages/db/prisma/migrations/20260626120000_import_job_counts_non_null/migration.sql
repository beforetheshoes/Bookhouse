-- ImportJob.totalFiles / processedFiles / errorCount are always written on
-- creation, so make them non-nullable with a 0 default and drop the downstream
-- `?? 0` guards. Backfill any pre-existing NULLs to 0 before adding NOT NULL.
UPDATE "ImportJob" SET "totalFiles" = 0 WHERE "totalFiles" IS NULL;
UPDATE "ImportJob" SET "processedFiles" = 0 WHERE "processedFiles" IS NULL;
UPDATE "ImportJob" SET "errorCount" = 0 WHERE "errorCount" IS NULL;

ALTER TABLE "ImportJob"
  ALTER COLUMN "totalFiles" SET DEFAULT 0,
  ALTER COLUMN "totalFiles" SET NOT NULL,
  ALTER COLUMN "processedFiles" SET DEFAULT 0,
  ALTER COLUMN "processedFiles" SET NOT NULL,
  ALTER COLUMN "errorCount" SET DEFAULT 0,
  ALTER COLUMN "errorCount" SET NOT NULL;
