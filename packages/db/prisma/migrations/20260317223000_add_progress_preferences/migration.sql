CREATE TYPE "ProgressTrackingMode" AS ENUM ('BY_EDITION', 'BY_WORK');

CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progressTrackingMode" "ProgressTrackingMode" NOT NULL DEFAULT 'BY_EDITION',

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkProgressPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "progressTrackingMode" "ProgressTrackingMode" NOT NULL,

    CONSTRAINT "WorkProgressPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");
CREATE UNIQUE INDEX "WorkProgressPreference_userId_workId_key" ON "WorkProgressPreference"("userId", "workId");
CREATE INDEX "WorkProgressPreference_workId_idx" ON "WorkProgressPreference"("workId");

ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkProgressPreference" ADD CONSTRAINT "WorkProgressPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkProgressPreference" ADD CONSTRAINT "WorkProgressPreference_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
