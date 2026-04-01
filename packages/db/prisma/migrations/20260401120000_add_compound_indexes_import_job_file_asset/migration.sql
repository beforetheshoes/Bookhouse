-- CreateIndex
CREATE INDEX "FileAsset_libraryRootId_availabilityStatus_idx" ON "FileAsset"("libraryRootId", "availabilityStatus");

-- CreateIndex
CREATE INDEX "ImportJob_libraryRootId_status_idx" ON "ImportJob"("libraryRootId", "status");
