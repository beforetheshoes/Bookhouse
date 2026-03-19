-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "errorCount" INTEGER,
ADD COLUMN     "processedFiles" INTEGER,
ADD COLUMN     "totalFiles" INTEGER;
