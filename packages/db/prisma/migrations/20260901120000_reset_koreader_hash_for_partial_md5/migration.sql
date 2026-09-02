-- KOReader's kosync plugin identifies a document by util.partialMD5 (an MD5
-- over 1 KiB samples at exponentially spaced offsets), not by an MD5 of the
-- whole file. Every stored koreaderHash was computed the old way and could
-- never match a device request, so clear them; the KOReader document resolver
-- and the hash job recompute the partial digest on demand. Idempotent.
UPDATE "FileAsset" SET "koreaderHash" = NULL WHERE "koreaderHash" IS NOT NULL;
