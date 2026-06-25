-- AlterTable: per-device flag so the legacy Kobo entitlement cleanup runs once
-- per device instead of re-emitting a removal for every eligible edition on
-- every sync.
ALTER TABLE "KoboDevice" ADD COLUMN     "legacyCleanupDoneAt" TIMESTAMP(3);
