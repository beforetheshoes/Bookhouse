-- CreateEnum
CREATE TYPE "KoboDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "KoboDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "status" "KoboDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KoboDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoboDeviceCollection" (
    "id" TEXT NOT NULL,
    "koboDeviceId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,

    CONSTRAINT "KoboDeviceCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoboSyncedBook" (
    "id" TEXT NOT NULL,
    "koboDeviceId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "KoboSyncedBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KoboDevice_authToken_key" ON "KoboDevice"("authToken");

-- CreateIndex
CREATE UNIQUE INDEX "KoboDevice_userId_deviceId_key" ON "KoboDevice"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "KoboDeviceCollection_koboDeviceId_collectionId_key" ON "KoboDeviceCollection"("koboDeviceId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "KoboSyncedBook_koboDeviceId_editionId_key" ON "KoboSyncedBook"("koboDeviceId", "editionId");

-- CreateIndex
CREATE INDEX "KoboSyncedBook_koboDeviceId_idx" ON "KoboSyncedBook"("koboDeviceId");

-- AddForeignKey
ALTER TABLE "KoboDevice" ADD CONSTRAINT "KoboDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoboDeviceCollection" ADD CONSTRAINT "KoboDeviceCollection_koboDeviceId_fkey" FOREIGN KEY ("koboDeviceId") REFERENCES "KoboDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoboDeviceCollection" ADD CONSTRAINT "KoboDeviceCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoboSyncedBook" ADD CONSTRAINT "KoboSyncedBook_koboDeviceId_fkey" FOREIGN KEY ("koboDeviceId") REFERENCES "KoboDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoboSyncedBook" ADD CONSTRAINT "KoboSyncedBook_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
