-- Merge duplicate Contributor rows that share the same nameCanonical and add
-- a UNIQUE constraint to prevent the bug from recurring. Duplicates were
-- created by a TOCTOU race in services.ts: two concurrent ingest jobs both
-- ran findMany (saw nothing) and both ran create (no unique constraint).

-- For each set of contributors sharing a nameCanonical, keep the row with the
-- lexicographically smallest id and merge the rest into it. DISTINCT ON gives
-- a deterministic pick.
--
-- The dupe -> keeper mapping is repeated as a self-contained subquery in each
-- statement rather than staged in a TEMPORARY TABLE. A temp table declared
-- ON COMMIT DROP is gone before the next statement runs, and merely dropping
-- the ON COMMIT clause would leave correctness resting on every statement
-- sharing one session. Recomputing depends on nothing and costs little at
-- this table's size.
--
-- Every statement sees the same mapping because "Contributor" is only
-- modified by step 3, the last statement to reference it.

-- Step 1: Delete EditionContributor rows on the dupe side whose repoint
-- would collide with an existing keeper-side row (same edition + role).
-- The (editionId, contributorId, role) unique index would otherwise block
-- the UPDATE in step 2.
DELETE FROM "EditionContributor" ec
USING (
    SELECT c."id" AS dupe_id, k.keeper_id
    FROM "Contributor" c
    JOIN (
        SELECT DISTINCT ON ("nameCanonical") "id" AS keeper_id, "nameCanonical"
        FROM "Contributor"
        ORDER BY "nameCanonical", "id"
    ) k ON c."nameCanonical" = k."nameCanonical"
    WHERE c."id" <> k.keeper_id
) d
WHERE ec."contributorId" = d.dupe_id
  AND EXISTS (
    SELECT 1 FROM "EditionContributor" ec2
    WHERE ec2."editionId" = ec."editionId"
      AND ec2."role" = ec."role"
      AND ec2."contributorId" = d.keeper_id
  );

-- Step 2: Repoint remaining EditionContributor rows from the dupe to the
-- keeper.
UPDATE "EditionContributor" ec
SET "contributorId" = d.keeper_id
FROM (
    SELECT c."id" AS dupe_id, k.keeper_id
    FROM "Contributor" c
    JOIN (
        SELECT DISTINCT ON ("nameCanonical") "id" AS keeper_id, "nameCanonical"
        FROM "Contributor"
        ORDER BY "nameCanonical", "id"
    ) k ON c."nameCanonical" = k."nameCanonical"
    WHERE c."id" <> k.keeper_id
) d
WHERE ec."contributorId" = d.dupe_id;

-- Step 3: Drop the now-orphaned dupe Contributor rows.
DELETE FROM "Contributor" c
USING (
    SELECT c2."id" AS dupe_id
    FROM "Contributor" c2
    JOIN (
        SELECT DISTINCT ON ("nameCanonical") "id" AS keeper_id, "nameCanonical"
        FROM "Contributor"
        ORDER BY "nameCanonical", "id"
    ) k ON c2."nameCanonical" = k."nameCanonical"
    WHERE c2."id" <> k.keeper_id
) d
WHERE c."id" = d.dupe_id;

-- Step 4: Replace the existing non-unique index with a unique one. The
-- DROP must come before the unique CREATE because both target the same
-- expression (Postgres allows multiple indexes on the same column, but
-- we want the index Prisma expects from the @unique attribute).
DROP INDEX IF EXISTS "Contributor_nameCanonical_idx";
CREATE UNIQUE INDEX "Contributor_nameCanonical_key" ON "Contributor"("nameCanonical");
