-- Remap removed enum values before narrowing the type.
ALTER TYPE "ScanStage" RENAME TO "ScanStage_old";

CREATE TYPE "ScanStage" AS ENUM ('DISCOVERY', 'PROCESSING');

ALTER TABLE "ImportJob"
ALTER COLUMN "scanStage" TYPE "ScanStage"
USING (
  CASE
    WHEN "scanStage"::text = 'ENRICHING' THEN 'PROCESSING'
    ELSE "scanStage"::text
  END
)::"ScanStage";

DROP TYPE "ScanStage_old";

ALTER TABLE "ImportJob"
DROP COLUMN "completedProcessingJobs",
DROP COLUMN "totalProcessingJobs";
