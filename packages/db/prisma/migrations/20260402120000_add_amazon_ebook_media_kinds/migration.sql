-- Add Amazon ebook media kinds.
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'MOBI';
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'AZW';
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'AZW3';

-- Reclassify existing file assets so they can be parsed and matched.
UPDATE "FileAsset"
SET "mediaKind" = CASE LOWER(COALESCE("extension", ''))
  WHEN 'mobi' THEN 'MOBI'::"MediaKind"
  WHEN 'azw' THEN 'AZW'::"MediaKind"
  WHEN 'azw3' THEN 'AZW3'::"MediaKind"
  ELSE "mediaKind"
END
WHERE "mediaKind" = 'OTHER'
  AND LOWER(COALESCE("extension", '')) IN ('mobi', 'azw', 'azw3');
