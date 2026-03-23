-- CreateEnum
CREATE TYPE "ScanStage" AS ENUM ('DISCOVERY', 'PROCESSING', 'ENRICHING');

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "completedProcessingJobs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scanStage" "ScanStage",
ADD COLUMN     "totalProcessingJobs" INTEGER;
