-- AllowedEmail: pre-approved emails permitted to log in as viewers.
CREATE TABLE "AllowedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllowedEmail_email_key" ON "AllowedEmail"("email");

-- Backfill: if there is exactly one User row (the typical upgrade from
-- pre-multi-user installs), promote them to OWNER. If there are zero users,
-- the first login through upsertOidcUser will self-promote. If there are
-- multiple users (anomalous — possibly stray E2E identities mixed into a dev
-- DB), DO NOTHING and require the operator to run scripts/promote-owner.ts
-- explicitly so a stale identity does not silently take over the install.
INSERT INTO "UserRole" ("id", "userId", "role")
SELECT
    'mig_' || md5("User"."id" || '|OWNER'),
    "User"."id",
    'OWNER'
FROM "User"
WHERE (SELECT COUNT(*) FROM "User") = 1
  AND NOT EXISTS (
    SELECT 1 FROM "UserRole"
    WHERE "UserRole"."userId" = "User"."id" AND "UserRole"."role" = 'OWNER'
  )
ON CONFLICT ("id") DO NOTHING;

-- Assign any existing collections without an owner to the owner we just
-- promoted (or any pre-existing owner, if the OWNER role was already set).
UPDATE "Collection"
SET "ownerUserId" = (
    SELECT "userId" FROM "UserRole"
    WHERE "role" = 'OWNER'
    ORDER BY "id" ASC
    LIMIT 1
)
WHERE "ownerUserId" IS NULL
  AND EXISTS (SELECT 1 FROM "UserRole" WHERE "role" = 'OWNER');

-- Cascade-delete Collections when their owner User is deleted. Without this,
-- the optional FK defaults to SET NULL, leaving orphaned per-user shelves
-- that nobody can see or clean up.
ALTER TABLE "Collection"
DROP CONSTRAINT IF EXISTS "Collection_ownerUserId_fkey";

ALTER TABLE "Collection"
ADD CONSTRAINT "Collection_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
