-- AlterTable: make editionId optional on ExternalLink
ALTER TABLE "ExternalLink" ALTER COLUMN "editionId" DROP NOT NULL;

-- AddColumn: workId on ExternalLink
ALTER TABLE "ExternalLink" ADD COLUMN "workId" TEXT;

-- AddColumn: appliedAt on ExternalLink
ALTER TABLE "ExternalLink" ADD COLUMN "appliedAt" TIMESTAMP(3);

-- AddColumn: appliedFields on ExternalLink
ALTER TABLE "ExternalLink" ADD COLUMN "appliedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropForeignKey (re-create as optional)
ALTER TABLE "ExternalLink" DROP CONSTRAINT "ExternalLink_editionId_fkey";

-- AddForeignKey: edition (optional)
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: work
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: workId
CREATE INDEX "ExternalLink_workId_idx" ON "ExternalLink"("workId");

-- DropIndex: old unique constraint (will be recreated to handle nullable)
DROP INDEX "ExternalLink_editionId_provider_externalId_key";

-- CreateIndex: unique constraint for edition-level links
CREATE UNIQUE INDEX "ExternalLink_editionId_provider_externalId_key" ON "ExternalLink"("editionId", "provider", "externalId");

-- CreateIndex: unique constraint for work-level links
CREATE UNIQUE INDEX "ExternalLink_workId_provider_externalId_key" ON "ExternalLink"("workId", "provider", "externalId");
