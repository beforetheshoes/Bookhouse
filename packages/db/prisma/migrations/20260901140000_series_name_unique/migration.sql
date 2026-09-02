-- Two concurrent PARSE jobs for books in the same series both saw no Series
-- row and both created one, splitting the series page in two. Merge the
-- duplicates (keeper = lexicographically smallest id, so the pick is
-- deterministic), repoint their works, then make the name unique so the race
-- resolves at the constraint instead of creating rows.
UPDATE "Work" w
SET "seriesId" = k.keeper_id
FROM "Series" s
JOIN (
    SELECT DISTINCT ON ("name") "id" AS keeper_id, "name"
    FROM "Series"
    ORDER BY "name", "id"
) k ON s."name" = k."name"
WHERE w."seriesId" = s."id"
  AND s."id" <> k.keeper_id;

DELETE FROM "Series" s
USING (
    SELECT DISTINCT ON ("name") "id" AS keeper_id, "name"
    FROM "Series"
    ORDER BY "name", "id"
) k
WHERE s."name" = k."name"
  AND s."id" <> k.keeper_id;

DROP INDEX IF EXISTS "Series_name_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Series_name_key" ON "Series"("name");
