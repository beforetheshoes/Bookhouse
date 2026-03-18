-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "attemptsMade" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bullmqJobId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_bullmqJobId_key" ON "ImportJob"("bullmqJobId");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_kind_idx" ON "ImportJob"("kind");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");
