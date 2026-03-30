-- AlterTable
ALTER TABLE "Work" ADD COLUMN "preferredSyncEditionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Work_preferredSyncEditionId_key" ON "Work"("preferredSyncEditionId");

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_preferredSyncEditionId_fkey" FOREIGN KEY ("preferredSyncEditionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
