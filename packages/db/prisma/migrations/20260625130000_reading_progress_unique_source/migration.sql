-- Enforce one ReadingProgress row per (user, edition, progressKind, source).
-- Legacy rows used a null source (treated as "manual"); normalize them, then
-- collapse any duplicates (keeping the most recently updated), before making
-- the column NOT NULL and adding the unique index.

-- 1. Normalize legacy null sources to "manual".
UPDATE "ReadingProgress" SET "source" = 'manual' WHERE "source" IS NULL;

-- 2. De-duplicate: keep the most recently updated row per tuple, drop the rest.
DELETE FROM "ReadingProgress"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           row_number() OVER (
             PARTITION BY "userId", "editionId", "progressKind", "source"
             ORDER BY "updatedAt" DESC, "id" DESC
           ) AS rn
    FROM "ReadingProgress"
  ) ranked
  WHERE ranked.rn > 1
);

-- 3. Make source NOT NULL with a default (matches schema).
ALTER TABLE "ReadingProgress" ALTER COLUMN "source" SET NOT NULL,
ALTER COLUMN "source" SET DEFAULT 'manual';

-- 4. Enforce uniqueness.
CREATE UNIQUE INDEX "ReadingProgress_userId_editionId_progressKind_source_key" ON "ReadingProgress"("userId", "editionId", "progressKind", "source");
