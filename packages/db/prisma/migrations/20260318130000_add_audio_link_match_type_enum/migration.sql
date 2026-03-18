CREATE TYPE "AudioLinkMatchType" AS ENUM ('SAME_WORK', 'EXACT_METADATA');

ALTER TABLE "AudioLink"
ALTER COLUMN "matchType" TYPE "AudioLinkMatchType"
USING "matchType"::"AudioLinkMatchType";
