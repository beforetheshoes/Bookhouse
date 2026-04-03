-- Add BULK_ENRICH to ImportJobKind enum for bulk metadata enrichment jobs.
ALTER TYPE "ImportJobKind" ADD VALUE IF NOT EXISTS 'BULK_ENRICH';
