ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'KEPUB';

UPDATE "FileAsset"
SET "mediaKind" = 'KEPUB'
WHERE "extension" = 'kepub'
  AND "mediaKind" = 'EPUB';
