-- CreateEnum
CREATE TYPE "LibraryRootKind" AS ENUM ('EBOOKS', 'AUDIOBOOKS', 'MIXED');

-- CreateEnum
CREATE TYPE "ScanMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('EPUB', 'PDF', 'CBZ', 'AUDIO', 'COVER', 'SIDECAR', 'OTHER');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('PRESENT', 'MISSING', 'IGNORED');

-- CreateEnum
CREATE TYPE "FormatFamily" AS ENUM ('EBOOK', 'AUDIOBOOK');

-- CreateEnum
CREATE TYPE "ContributorRole" AS ENUM ('AUTHOR', 'NARRATOR', 'EDITOR', 'TRANSLATOR', 'ILLUSTRATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "EditionFileRole" AS ENUM ('PRIMARY', 'ALTERNATE_FORMAT', 'SUPPLEMENT', 'AUDIO_TRACK');

-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "ProgressKind" AS ENUM ('EBOOK', 'AUDIO', 'READALOUD');

-- CreateEnum
CREATE TYPE "DuplicateReason" AS ENUM ('SAME_HASH', 'SAME_ISBN', 'SIMILAR_TITLE_AUTHOR', 'SAME_PATH_PATTERN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IGNORED', 'CONFIRMED', 'MERGED');

-- CreateEnum
CREATE TYPE "ImportJobKind" AS ENUM ('SCAN_ROOT', 'HASH_FILE', 'PARSE_FILE', 'REFRESH_METADATA', 'DETECT_DUPLICATES', 'MATCH_AUDIO');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryRoot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" "LibraryRootKind" NOT NULL,
    "scanMode" "ScanMode" NOT NULL DEFAULT 'INCREMENTAL',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryRoot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "libraryRootId" TEXT NOT NULL,
    "absolutePath" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "basename" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "ctime" TIMESTAMP(3),
    "mtime" TIMESTAMP(3),
    "partialHash" TEXT,
    "fullHash" TEXT,
    "mediaKind" "MediaKind" NOT NULL,
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'PRESENT',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "titleCanonical" TEXT NOT NULL,
    "titleDisplay" TEXT NOT NULL,
    "sortTitle" TEXT,
    "description" TEXT,
    "language" TEXT,
    "seriesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "formatFamily" "FormatFamily" NOT NULL,
    "publisher" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isbn13" TEXT,
    "isbn10" TEXT,
    "asin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditionFile" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "role" "EditionFileRole" NOT NULL DEFAULT 'PRIMARY',

    CONSTRAINT "EditionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "nameDisplay" TEXT NOT NULL,
    "nameCanonical" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditionContributor" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "role" "ContributorRole" NOT NULL,

    CONSTRAINT "EditionContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "CollectionKind" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "progressKind" "ProgressKind" NOT NULL,
    "locator" JSONB NOT NULL,
    "percent" DOUBLE PRECISION,
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioLink" (
    "id" TEXT NOT NULL,
    "ebookEditionId" TEXT NOT NULL,
    "audioEditionId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "AudioLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "leftEditionId" TEXT,
    "rightEditionId" TEXT,
    "leftFileAssetId" TEXT,
    "rightFileAssetId" TEXT,
    "reason" "DuplicateReason" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "libraryRootId" TEXT,
    "kind" "ImportJobKind" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "error" TEXT,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerAccountId_key" ON "UserIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryRoot_path_key" ON "LibraryRoot"("path");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_absolutePath_key" ON "FileAsset"("absolutePath");

-- CreateIndex
CREATE INDEX "FileAsset_libraryRootId_idx" ON "FileAsset"("libraryRootId");

-- CreateIndex
CREATE INDEX "FileAsset_partialHash_idx" ON "FileAsset"("partialHash");

-- CreateIndex
CREATE INDEX "FileAsset_fullHash_idx" ON "FileAsset"("fullHash");

-- CreateIndex
CREATE INDEX "Work_titleCanonical_idx" ON "Work"("titleCanonical");

-- CreateIndex
CREATE INDEX "Edition_workId_idx" ON "Edition"("workId");

-- CreateIndex
CREATE INDEX "Edition_isbn13_idx" ON "Edition"("isbn13");

-- CreateIndex
CREATE UNIQUE INDEX "EditionFile_editionId_fileAssetId_key" ON "EditionFile"("editionId", "fileAssetId");

-- CreateIndex
CREATE INDEX "Contributor_nameCanonical_idx" ON "Contributor"("nameCanonical");

-- CreateIndex
CREATE UNIQUE INDEX "EditionContributor_editionId_contributorId_role_key" ON "EditionContributor"("editionId", "contributorId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_editionId_key" ON "CollectionItem"("collectionId", "editionId");

-- CreateIndex
CREATE INDEX "ReadingProgress_userId_editionId_idx" ON "ReadingProgress"("userId", "editionId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioLink_ebookEditionId_audioEditionId_key" ON "AudioLink"("ebookEditionId", "audioEditionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalLink_editionId_provider_externalId_key" ON "ExternalLink"("editionId", "provider", "externalId");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_libraryRootId_fkey" FOREIGN KEY ("libraryRootId") REFERENCES "LibraryRoot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionFile" ADD CONSTRAINT "EditionFile_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionFile" ADD CONSTRAINT "EditionFile_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionContributor" ADD CONSTRAINT "EditionContributor_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionContributor" ADD CONSTRAINT "EditionContributor_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioLink" ADD CONSTRAINT "AudioLink_ebookEditionId_fkey" FOREIGN KEY ("ebookEditionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioLink" ADD CONSTRAINT "AudioLink_audioEditionId_fkey" FOREIGN KEY ("audioEditionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_leftEditionId_fkey" FOREIGN KEY ("leftEditionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_rightEditionId_fkey" FOREIGN KEY ("rightEditionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_leftFileAssetId_fkey" FOREIGN KEY ("leftFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_rightFileAssetId_fkey" FOREIGN KEY ("rightFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_libraryRootId_fkey" FOREIGN KEY ("libraryRootId") REFERENCES "LibraryRoot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
