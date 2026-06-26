-- The 20260324120000 rename of AudioLink → MatchSuggestion renamed the table,
-- its columns, the primary key, and the unique index, but left the two
-- foreign-key constraints with their original AudioLink_* names. Align them
-- with the names Prisma derives from the current schema so `migrate diff` /
-- `migrate dev` no longer report drift.
--
-- Rename-only: no data is touched. Each rename is guarded so this migration is
-- a no-op on databases where the constraints already carry the new names (for
-- example a fresh build from a future squashed migration set).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AudioLink_ebookWorkId_fkey'
      AND conrelid = '"MatchSuggestion"'::regclass
  ) THEN
    ALTER TABLE "MatchSuggestion"
      RENAME CONSTRAINT "AudioLink_ebookWorkId_fkey" TO "MatchSuggestion_targetWorkId_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AudioLink_audioWorkId_fkey'
      AND conrelid = '"MatchSuggestion"'::regclass
  ) THEN
    ALTER TABLE "MatchSuggestion"
      RENAME CONSTRAINT "AudioLink_audioWorkId_fkey" TO "MatchSuggestion_suggestedWorkId_fkey";
  END IF;
END $$;
