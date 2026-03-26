-- Add editedFields to Work
ALTER TABLE "Work" ADD COLUMN "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Add editedFields to Edition
ALTER TABLE "Edition" ADD COLUMN "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Move language from Work to Edition
ALTER TABLE "Edition" ADD COLUMN "language" TEXT;

-- Copy language from Work to all its Editions
UPDATE "Edition" SET "language" = "Work"."language"
FROM "Work"
WHERE "Edition"."workId" = "Work"."id";

-- Remove language from Work
ALTER TABLE "Work" DROP COLUMN "language";
