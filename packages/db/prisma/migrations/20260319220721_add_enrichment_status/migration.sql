-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('STUB', 'ENRICHED');

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'ENRICHED';
