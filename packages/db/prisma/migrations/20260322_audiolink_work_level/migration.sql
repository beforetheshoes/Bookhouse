-- Clear all existing AudioLink rows (works are already merged, rows are redundant)
DELETE FROM "AudioLink";

-- Drop old unique constraint and foreign keys
ALTER TABLE "AudioLink" DROP CONSTRAINT IF EXISTS "AudioLink_ebookEditionId_audioEditionId_key";
ALTER TABLE "AudioLink" DROP CONSTRAINT IF EXISTS "AudioLink_ebookEditionId_fkey";
ALTER TABLE "AudioLink" DROP CONSTRAINT IF EXISTS "AudioLink_audioEditionId_fkey";

-- Drop old columns
ALTER TABLE "AudioLink" DROP COLUMN "ebookEditionId";
ALTER TABLE "AudioLink" DROP COLUMN "audioEditionId";

-- Add new work-level columns
ALTER TABLE "AudioLink" ADD COLUMN "ebookWorkId" TEXT NOT NULL;
ALTER TABLE "AudioLink" ADD COLUMN "audioWorkId" TEXT NOT NULL;

-- Add foreign keys
ALTER TABLE "AudioLink" ADD CONSTRAINT "AudioLink_ebookWorkId_fkey" FOREIGN KEY ("ebookWorkId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioLink" ADD CONSTRAINT "AudioLink_audioWorkId_fkey" FOREIGN KEY ("audioWorkId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add unique constraint
ALTER TABLE "AudioLink" ADD CONSTRAINT "AudioLink_ebookWorkId_audioWorkId_key" UNIQUE ("ebookWorkId", "audioWorkId");
