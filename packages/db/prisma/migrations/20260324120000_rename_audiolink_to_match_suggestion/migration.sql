-- Rename AudioLinkMatchType enum to MatchSuggestionType
ALTER TYPE "AudioLinkMatchType" RENAME TO "MatchSuggestionType";

-- Rename ImportJobKind enum value MATCH_AUDIO to MATCH_SUGGESTIONS
ALTER TYPE "ImportJobKind" RENAME VALUE 'MATCH_AUDIO' TO 'MATCH_SUGGESTIONS';

-- Rename AudioLink table to MatchSuggestion
ALTER TABLE "AudioLink" RENAME TO "MatchSuggestion";

-- Rename columns
ALTER TABLE "MatchSuggestion" RENAME COLUMN "ebookWorkId" TO "targetWorkId";
ALTER TABLE "MatchSuggestion" RENAME COLUMN "audioWorkId" TO "suggestedWorkId";

-- Rename unique constraint and indexes
ALTER INDEX "AudioLink_pkey" RENAME TO "MatchSuggestion_pkey";
ALTER INDEX "AudioLink_ebookWorkId_audioWorkId_key" RENAME TO "MatchSuggestion_targetWorkId_suggestedWorkId_key";
