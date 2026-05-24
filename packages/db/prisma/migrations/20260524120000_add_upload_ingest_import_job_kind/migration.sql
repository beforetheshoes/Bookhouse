-- Add UPLOAD_INGEST to ImportJobKind enum for tracking user-initiated book uploads.
ALTER TYPE "ImportJobKind" ADD VALUE IF NOT EXISTS 'UPLOAD_INGEST';
