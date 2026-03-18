import path from "node:path";
import { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import {
  AudioLinkMatchType,
  AvailabilityStatus,
  ContributorRole,
  DuplicateReason,
  EditionFileRole,
  FormatFamily,
  type Contributor,
  type Edition,
  type EditionFile,
  type FileAsset,
  MediaKind,
  type LibraryRoot,
  ReviewStatus,
  type Work,
} from "@bookhouse/domain";
import { db, type EditionContributor } from "@bookhouse/db";
import {
  type DetectDuplicatesJobPayload,
  LIBRARY_JOB_NAMES,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchAudioLinksJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  QUEUES,
  getQueueConnectionConfig,
} from "@bookhouse/shared";
import { classifyMediaKind, getFileExtension, normalizeRelativePath, normalizeRootPath } from "./classification";
import { parseEpubMetadata, type ParsedEpubMetadataRaw } from "./epub";
import { hashFileContents } from "./hashing";
import {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  normalizeBookMetadata,
  type NormalizedBookMetadata,
} from "./metadata";

export interface ParsedFileAssetMetadata {
  normalized?: NormalizedBookMetadata;
  parsedAt: string;
  parserVersion: number;
  raw?: ParsedEpubMetadataRaw;
  source: "epub";
  status: "parsed" | "unparseable";
  warnings: string[];
}

type FileAssetRecord = Pick<
  FileAsset,
  | "absolutePath"
  | "availabilityStatus"
  | "fullHash"
  | "id"
  | "mediaKind"
  | "mtime"
  | "metadata"
  | "partialHash"
  | "sizeBytes"
>;

type LibraryRootRecord = Pick<LibraryRoot, "id" | "lastScannedAt" | "path">;
type WorkRecord = Pick<Work, "id" | "sortTitle" | "titleCanonical" | "titleDisplay">;
type EditionRecord = Pick<
  Edition,
  "asin" | "formatFamily" | "id" | "isbn10" | "isbn13" | "publishedAt" | "publisher" | "workId"
>;
type ContributorRecord = Pick<Contributor, "id" | "nameCanonical" | "nameDisplay">;
type EditionFileRecord = Pick<EditionFile, "editionId" | "fileAssetId" | "id" | "role">;
type EditionContributorRecord = Pick<EditionContributor, "contributorId" | "editionId" | "id" | "role">;
type WorkMatchRecord = WorkRecord & {
  editions: Array<
    EditionRecord & {
      contributors: Array<
        EditionContributorRecord & {
          contributor: ContributorRecord;
        }
      >;
    }
  >;
};

interface FileAssetCreateInput {
  absolutePath: string;
  availabilityStatus: AvailabilityStatus;
  basename: string;
  ctime: Date;
  extension: string | null;
  lastSeenAt: Date;
  libraryRootId: string;
  mediaKind: MediaKind;
  metadata?: FileAsset["metadata"];
  mtime: Date;
  relativePath: string;
  sizeBytes: bigint;
}

interface FileAssetUpdateInput extends Omit<FileAssetCreateInput, "absolutePath" | "libraryRootId"> {
  fullHash?: string | null;
  partialHash?: string | null;
}

interface LibraryRootFindUniqueArgs {
  where: { id: string };
}

interface FileAssetFindManyArgs {
  where: { libraryRootId: string };
}

interface FileAssetUpsertArgs {
  where: { absolutePath: string };
  create: FileAssetCreateInput;
  update: FileAssetUpdateInput;
}

interface FileAssetUpdateArgs {
  where: { id: string };
  data: Partial<FileAssetUpdateInput>;
}

interface WorkFindManyArgs {
  where: { titleCanonical: string };
  include: {
    editions: {
      include: {
        contributors: {
          include: {
            contributor: true;
          };
        };
      };
    };
  };
}

interface WorkCreateArgs {
  data: Pick<WorkRecord, "sortTitle" | "titleCanonical" | "titleDisplay">;
}

interface EditionFindFirstArgs {
  where: Partial<Pick<EditionRecord, "asin" | "id" | "isbn10" | "isbn13">>;
}

interface EditionCreateArgs {
  data: Pick<
    EditionRecord,
    "asin" | "formatFamily" | "isbn10" | "isbn13" | "publishedAt" | "publisher" | "workId"
  >;
}

interface EditionFileFindFirstArgs {
  where:
    | { editionId: string; fileAssetId?: string }
    | { editionId?: string; fileAssetId: string };
}

interface EditionFileCreateArgs {
  data: Pick<EditionFileRecord, "editionId" | "fileAssetId" | "role">;
}

interface ContributorFindManyArgs {
  where: { nameCanonical: { in: string[] } };
}

interface ContributorCreateArgs {
  data: Pick<ContributorRecord, "nameCanonical" | "nameDisplay">;
}

interface EditionContributorFindFirstArgs {
  where: Pick<EditionContributorRecord, "contributorId" | "editionId" | "role">;
}

interface EditionContributorCreateArgs {
  data: Pick<EditionContributorRecord, "contributorId" | "editionId" | "role">;
}

interface LibraryRootUpdateArgs {
  where: { id: string };
  data: { lastScannedAt: Date };
}

export interface IngestDb {
  libraryRoot: {
    findUnique(args: LibraryRootFindUniqueArgs): Promise<LibraryRootRecord | null>;
    update(args: LibraryRootUpdateArgs): Promise<LibraryRootRecord>;
  };
  fileAsset: {
    findMany(args: FileAssetFindManyArgs): Promise<FileAssetRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<FileAssetRecord | null>;
    update(args: FileAssetUpdateArgs): Promise<FileAssetRecord>;
    upsert(args: FileAssetUpsertArgs): Promise<FileAssetRecord>;
  };
  work: {
    create(args: WorkCreateArgs): Promise<WorkRecord>;
    findMany(args: WorkFindManyArgs): Promise<WorkMatchRecord[]>;
  };
  edition: {
    create(args: EditionCreateArgs): Promise<EditionRecord>;
    findFirst(args: EditionFindFirstArgs): Promise<EditionRecord | null>;
    findUnique(args: { where: { id: string } }): Promise<EditionRecord | null>;
  };
  editionFile: {
    create(args: EditionFileCreateArgs): Promise<EditionFileRecord>;
    findFirst(args: EditionFileFindFirstArgs): Promise<EditionFileRecord | null>;
  };
  contributor: {
    create(args: ContributorCreateArgs): Promise<ContributorRecord>;
    findMany(args: ContributorFindManyArgs): Promise<ContributorRecord[]>;
  };
  editionContributor: {
    create(args: EditionContributorCreateArgs): Promise<EditionContributorRecord>;
    findFirst(args: EditionContributorFindFirstArgs): Promise<EditionContributorRecord | null>;
  };
}

export interface IngestDependencies {
  db: IngestDb;
  enqueueLibraryJob<TName extends LibraryJobName>(
    jobName: TName,
    payload: LibraryJobPayload<TName>,
  ): Promise<void>;
  listDirectory: typeof readdir;
  readStats: typeof lstat;
  hashFile: typeof hashFileContents;
  parseEpub: typeof parseEpubMetadata;
}

export interface ScanLibraryRootInput {
  libraryRootId: string;
  now?: Date;
}

export interface ScanLibraryRootResult {
  discoveredPaths: string[];
  enqueuedHashJobs: string[];
  missingFileAssetIds: string[];
  scannedFileAssetIds: string[];
}

export interface HashFileAssetInput extends HashFileAssetJobPayload {
  now?: Date;
}

export interface HashFileAssetResult {
  availabilityStatus: AvailabilityStatus;
  fileAssetId: string;
  fullHash?: string;
  partialHash?: string;
}

export interface ParseFileAssetMetadataInput extends ParseFileAssetMetadataJobPayload {
  now?: Date;
}

export interface ParseFileAssetMetadataResult {
  availabilityStatus: AvailabilityStatus;
  fileAssetId: string;
  metadata?: ParsedFileAssetMetadata;
  skipped: boolean;
}

export interface MatchFileAssetToEditionInput extends MatchFileAssetToEditionJobPayload {
  now?: Date;
}

export interface MatchFileAssetToEditionResult {
  createdEdition: boolean;
  createdEditionFile: boolean;
  createdWork: boolean;
  editionId?: string;
  fileAssetId: string;
  skipped: boolean;
  workId?: string;
}

export type DetectDuplicatesInput = DetectDuplicatesJobPayload;

export type MatchAudioLinksInput = MatchAudioLinksJobPayload;

export interface AudioLinkMatchResult {
  createdAudioLinkIds: string[];
  ignoredAudioLinkIds: string[];
  scannedAudioEditionIds: string[];
  scannedEbookEditionIds: string[];
  updatedAudioLinkIds: string[];
}

export interface DetectDuplicatesResult {
  createdCandidateIds: string[];
  ignoredCandidateIds: string[];
  scannedEditionIds: string[];
  scannedFileAssetIds: string[];
  updatedCandidateIds: string[];
}

type DuplicateCandidateRecord = {
  confidence: number | null;
  id: string;
  leftEditionId: string | null;
  leftFileAssetId: string | null;
  reason: DuplicateReason;
  rightEditionId: string | null;
  rightFileAssetId: string | null;
  status: ReviewStatus;
};

type AudioLinkRecord = {
  audioEditionId: string;
  confidence: number | null;
  ebookEditionId: string;
  id: string;
  matchType: AudioLinkMatchType;
  reviewStatus: ReviewStatus;
};

type DuplicateDetectionFileAssetRecord = FileAssetRecord & {
  libraryRootId: string;
  relativePath: string;
};

type DuplicateDetectionEditionRecord = EditionRecord & {
  contributors: Array<
    EditionContributorRecord & {
      contributor: ContributorRecord;
    }
  >;
  editionFiles: Array<
    EditionFileRecord & {
      fileAsset: DuplicateDetectionFileAssetRecord;
    }
  >;
  work: WorkRecord;
};

type DuplicateDetectionDb = IngestDb & {
  duplicateCandidate: {
    create(args: {
      data: {
        confidence?: number | null;
        leftEditionId?: string | null;
        leftFileAssetId?: string | null;
        reason: DuplicateReason;
        rightEditionId?: string | null;
        rightFileAssetId?: string | null;
        status?: ReviewStatus;
      };
    }): Promise<DuplicateCandidateRecord>;
    findMany(args: Record<string, unknown>): Promise<DuplicateCandidateRecord[]>;
    update(args: {
      where: { id: string };
      data: Partial<Pick<DuplicateCandidateRecord, "confidence" | "status">>;
    }): Promise<DuplicateCandidateRecord>;
  };
  edition: IngestDb["edition"] & {
    findMany(args: Record<string, unknown>): Promise<DuplicateDetectionEditionRecord[]>;
  };
  editionFile: IngestDb["editionFile"] & {
    findMany(args: Record<string, unknown>): Promise<EditionFileRecord[]>;
  };
  fileAsset: IngestDb["fileAsset"] & {
    findMany(args: Record<string, unknown>): Promise<DuplicateDetectionFileAssetRecord[]>;
  };
};

type AudioMatchingEditionRecord = DuplicateDetectionEditionRecord;

type AudioMatchingDb = IngestDb & {
  audioLink: {
    create(args: {
      data: {
        audioEditionId: string;
        confidence?: number | null;
        ebookEditionId: string;
        matchType: AudioLinkMatchType;
        reviewStatus?: ReviewStatus;
      };
    }): Promise<AudioLinkRecord>;
    findMany(args: Record<string, unknown>): Promise<AudioLinkRecord[]>;
    update(args: {
      where: { id: string };
      data: Partial<Pick<AudioLinkRecord, "confidence" | "matchType" | "reviewStatus">>;
    }): Promise<AudioLinkRecord>;
  };
  edition: IngestDb["edition"] & {
    findMany(args: Record<string, unknown>): Promise<AudioMatchingEditionRecord[]>;
  };
  editionFile: IngestDb["editionFile"] & {
    findMany(args: Record<string, unknown>): Promise<EditionFileRecord[]>;
  };
  fileAsset: IngestDb["fileAsset"] & {
    findMany(args: Record<string, unknown>): Promise<DuplicateDetectionFileAssetRecord[]>;
  };
};

const EPUB_PARSER_VERSION = 1;

let queueSingleton:
  | {
      connection: IORedis;
      queue: Queue;
    }
  | undefined;

async function enqueueLibraryJob<TName extends LibraryJobName>(
  jobName: TName,
  payload: LibraryJobPayload<TName>,
): Promise<void> {
  if (queueSingleton === undefined) {
    const connection = new IORedis(getQueueConnectionConfig());
    const queue = new Queue(QUEUES.LIBRARY, { connection });
    queueSingleton = { connection, queue };
  }

  await queueSingleton.queue.add(jobName, payload);
}

function isFileChanged(existingFileAsset: FileAssetRecord | undefined, nextFileState: { mtime: Date; sizeBytes: bigint }): boolean {
  if (existingFileAsset === undefined) {
    return true;
  }

  if (existingFileAsset.sizeBytes !== nextFileState.sizeBytes) {
    return true;
  }

  if (existingFileAsset.mtime?.getTime() !== nextFileState.mtime.getTime()) {
    return true;
  }

  return existingFileAsset.partialHash === null || existingFileAsset.fullHash === null;
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

function parseStoredMetadata(metadata: FileAsset["metadata"]): ParsedFileAssetMetadata | undefined {
  if (metadata === null || typeof metadata !== "object") {
    return undefined;
  }

  const candidate = metadata as unknown as ParsedFileAssetMetadata;

  if (candidate.source !== "epub" || (candidate.status !== "parsed" && candidate.status !== "unparseable")) {
    return undefined;
  }

  return candidate;
}

function getAuthorCanonicalsForWork(work: WorkMatchRecord): string[] {
  return canonicalizeContributorNames(
    work.editions.flatMap((edition) =>
      edition.contributors
        .filter((contributor) => contributor.role === ContributorRole.AUTHOR)
        .map((contributor) => contributor.contributor.nameCanonical),
    ),
  );
}

function extractNormalizedMetadataForMatching(fileAsset: FileAssetRecord): {
  authorCanonicals: string[];
  authors: string[];
  title: string;
  titleCanonical: string;
} | undefined {
  const metadata = parseStoredMetadata(fileAsset.metadata);

  if (metadata?.status !== "parsed" || metadata.normalized === undefined) {
    return undefined;
  }

  const title = metadata.normalized.title;
  const authors = metadata.normalized.authors;

  if (title === undefined || authors.length === 0) {
    return undefined;
  }

  const titleCanonical = canonicalizeBookTitle(title);
  const authorCanonicals = canonicalizeContributorNames(authors);

  if (titleCanonical === undefined || authorCanonicals.length === 0) {
    return undefined;
  }

  return {
    authorCanonicals,
    authors,
    title,
    titleCanonical,
  };
}

function getAuthorCanonicalsForEdition(edition: DuplicateDetectionEditionRecord): string[] {
  return canonicalizeContributorNames(
    edition.contributors
      .filter((contributor) => contributor.role === ContributorRole.AUTHOR)
      .map((contributor) => contributor.contributor.nameCanonical),
  );
}

function createDuplicateCandidateKey(candidate: {
  leftEditionId?: string | null;
  leftFileAssetId?: string | null;
  reason: DuplicateReason;
  rightEditionId?: string | null;
  rightFileAssetId?: string | null;
}): string {
  if (candidate.leftEditionId && candidate.rightEditionId) {
    return `edition:${candidate.reason}:${candidate.leftEditionId}:${candidate.rightEditionId}`;
  }

  if (candidate.leftFileAssetId && candidate.rightFileAssetId) {
    return `file:${candidate.reason}:${candidate.leftFileAssetId}:${candidate.rightFileAssetId}`;
  }

  throw new Error("Duplicate candidate key requires a complete edition or file pair");
}

function createAudioLinkKey(link: {
  audioEditionId: string;
  ebookEditionId: string;
}): string {
  return `${link.ebookEditionId}:${link.audioEditionId}`;
}

function orderPair<TId extends string>(leftId: TId, rightId: TId): [TId, TId] {
  return leftId.localeCompare(rightId) <= 0 ? [leftId, rightId] : [rightId, leftId];
}

function shouldPreserveCandidateStatus(status: ReviewStatus): boolean {
  return status !== ReviewStatus.PENDING;
}

function buildAudioMatchConfidence(matchType: AudioLinkMatchType): number {
  return matchType === AudioLinkMatchType.SAME_WORK ? 1 : 0.95;
}

function canLinkAudioEditions(
  ebookEdition: AudioMatchingEditionRecord,
  audioEdition: AudioMatchingEditionRecord,
): AudioLinkMatchType | undefined {
  if (
    ebookEdition.formatFamily !== FormatFamily.EBOOK ||
    audioEdition.formatFamily !== FormatFamily.AUDIOBOOK
  ) {
    return undefined;
  }

  if (ebookEdition.id === audioEdition.id) {
    return undefined;
  }

  if (ebookEdition.workId === audioEdition.workId) {
    return AudioLinkMatchType.SAME_WORK;
  }

  const ebookAuthors = getAuthorCanonicalsForEdition(ebookEdition);
  const audioAuthors = getAuthorCanonicalsForEdition(audioEdition);

  if (
    ebookEdition.work.titleCanonical !== audioEdition.work.titleCanonical ||
    ebookAuthors.length === 0 ||
    ebookAuthors.length !== audioAuthors.length ||
    ebookAuthors.some((author, index) => author !== audioAuthors[index])
  ) {
    return undefined;
  }

  return AudioLinkMatchType.EXACT_METADATA;
}

function buildFuzzyDuplicateConfidence(
  leftEdition: DuplicateDetectionEditionRecord,
  rightEdition: DuplicateDetectionEditionRecord,
): number {
  const sharedFileHash = leftEdition.editionFiles.some((editionFile) =>
    editionFile.fileAsset.fullHash !== null &&
    rightEdition.editionFiles.some((candidateFile) => candidateFile.fileAsset.fullHash === editionFile.fileAsset.fullHash)
  );

  return sharedFileHash ? 0.99 : 0.9;
}

function canBeSameEditionDuplicate(
  leftEdition: DuplicateDetectionEditionRecord,
  rightEdition: DuplicateDetectionEditionRecord,
): boolean {
  if (
    leftEdition.formatFamily !== FormatFamily.EBOOK ||
    rightEdition.formatFamily !== FormatFamily.EBOOK
  ) {
    return false;
  }

  const leftAuthors = getAuthorCanonicalsForEdition(leftEdition);
  const rightAuthors = getAuthorCanonicalsForEdition(rightEdition);

  if (
    leftEdition.work.titleCanonical !== rightEdition.work.titleCanonical ||
    leftAuthors.length === 0 ||
    leftAuthors.length !== rightAuthors.length ||
    leftAuthors.some((author, index) => author !== rightAuthors[index])
  ) {
    return false;
  }

  const conflictingIsbn =
    (leftEdition.isbn13 !== null &&
      rightEdition.isbn13 !== null &&
      leftEdition.isbn13 !== rightEdition.isbn13) ||
    (leftEdition.isbn10 !== null &&
      rightEdition.isbn10 !== null &&
      leftEdition.isbn10 !== rightEdition.isbn10);

  return !conflictingIsbn;
}

async function ensureEditionFileLink(
  ingestDb: IngestDb,
  editionId: string,
  fileAssetId: string,
): Promise<boolean> {
  await ingestDb.editionFile.create({
    data: {
      editionId,
      fileAssetId,
      role: EditionFileRole.PRIMARY,
    },
  });

  return true;
}

async function ensureAuthorContributors(
  ingestDb: IngestDb,
  editionId: string,
  authors: string[],
): Promise<void> {
  const normalizedAuthors = authors
    .map((nameDisplay) => ({
      nameCanonical: canonicalizeContributorName(nameDisplay),
      nameDisplay,
    }))
    .filter(
      (author): author is { nameCanonical: string; nameDisplay: string } =>
        author.nameCanonical !== undefined,
    );

  const contributorsByCanonical = new Map(
    (
      await ingestDb.contributor.findMany({
        where: {
          nameCanonical: {
            in: [...new Set(normalizedAuthors.map((author) => author.nameCanonical))],
          },
        },
      })
    ).map((contributor) => [contributor.nameCanonical, contributor]),
  );

  for (const author of normalizedAuthors) {
    let contributor = contributorsByCanonical.get(author.nameCanonical);

    if (contributor === undefined) {
      contributor = await ingestDb.contributor.create({
        data: author,
      });
      contributorsByCanonical.set(contributor.nameCanonical, contributor);
    }

    const existingLink = await ingestDb.editionContributor.findFirst({
      where: {
        contributorId: contributor.id,
        editionId,
        role: ContributorRole.AUTHOR,
      },
    });

    if (existingLink === null) {
      await ingestDb.editionContributor.create({
        data: {
          contributorId: contributor.id,
          editionId,
          role: ContributorRole.AUTHOR,
        },
      });
    }
  }
}

async function walkRegularFiles(
  rootPath: string,
  listDirectory: typeof readdir,
  readStats: typeof lstat,
): Promise<string[]> {
  const pendingDirectories = [normalizeRootPath(rootPath)];
  const files: string[] = [];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop() as string;

    let entries: Dirent[];

    try {
      entries = await listDirectory(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        pendingDirectories.push(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(absolutePath);
        continue;
      }

      try {
        const entryStats = await readStats(absolutePath);

        if (entryStats.isSymbolicLink()) {
          continue;
        }

        if (entryStats.isDirectory()) {
          pendingDirectories.push(absolutePath);
          continue;
        }

        if (entryStats.isFile()) {
          files.push(absolutePath);
        }
      } catch {
        continue;
      }
    }
  }

  return files.sort();
}

async function getExistingLibraryRootOrThrow(ingestDb: IngestDb, libraryRootId: string): Promise<LibraryRootRecord> {
  const libraryRoot = await ingestDb.libraryRoot.findUnique({
    where: { id: libraryRootId },
  });

  if (libraryRoot === null) {
    throw new Error(`Library root "${libraryRootId}" was not found`);
  }

  return libraryRoot;
}

export function createIngestServices(
  dependencies: Partial<IngestDependencies> = {},
) {
  const ingestDb = dependencies.db ?? (db as unknown as IngestDb);
  const duplicateDetectionDb = ingestDb as unknown as DuplicateDetectionDb;
  const audioMatchingDb = ingestDb as unknown as AudioMatchingDb;
  const listDirectory = dependencies.listDirectory ?? readdir;
  const readStats = dependencies.readStats ?? lstat;
  const hashFile = dependencies.hashFile ?? hashFileContents;
  const parseEpub = dependencies.parseEpub ?? parseEpubMetadata;
  const enqueueJob = dependencies.enqueueLibraryJob ?? enqueueLibraryJob;

  async function scanLibraryRoot(input: ScanLibraryRootInput): Promise<ScanLibraryRootResult> {
    const now = input.now ?? new Date();
    const libraryRoot = await getExistingLibraryRootOrThrow(ingestDb, input.libraryRootId);
    const normalizedRootPath = normalizeRootPath(libraryRoot.path);
    const existingFileAssets = await ingestDb.fileAsset.findMany({
      where: { libraryRootId: libraryRoot.id },
    });
    const existingByPath = new Map(
      existingFileAssets.map((fileAsset) => [fileAsset.absolutePath, fileAsset]),
    );
    const discoveredPaths = await walkRegularFiles(normalizedRootPath, listDirectory, readStats);
    const seenPaths = new Set<string>();
    const scannedFileAssetIds: string[] = [];
    const enqueuedHashJobs: string[] = [];

    for (const absolutePath of discoveredPaths) {
      let fileStats;

      try {
        fileStats = await readStats(absolutePath);
      } catch {
        continue;
      }

      if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
        continue;
      }

      const relativePath = normalizeRelativePath(normalizedRootPath, absolutePath);
      const existingFileAsset = existingByPath.get(absolutePath);
      const upsertedFileAsset = await ingestDb.fileAsset.upsert({
        where: { absolutePath },
        create: {
          absolutePath,
          availabilityStatus: AvailabilityStatus.PRESENT,
          basename: path.basename(absolutePath),
          ctime: fileStats.ctime,
          extension: getFileExtension(absolutePath),
          lastSeenAt: now,
          libraryRootId: libraryRoot.id,
          mediaKind: classifyMediaKind(absolutePath),
          metadata: null,
          mtime: fileStats.mtime,
          relativePath,
          sizeBytes: BigInt(fileStats.size),
        },
        update: {
          availabilityStatus: AvailabilityStatus.PRESENT,
          basename: path.basename(absolutePath),
          ctime: fileStats.ctime,
          extension: getFileExtension(absolutePath),
          lastSeenAt: now,
          mediaKind: classifyMediaKind(absolutePath),
          mtime: fileStats.mtime,
          relativePath,
          sizeBytes: BigInt(fileStats.size),
        },
      });

      seenPaths.add(absolutePath);
      scannedFileAssetIds.push(upsertedFileAsset.id);

      if (
        isFileChanged(existingFileAsset, {
          mtime: fileStats.mtime,
          sizeBytes: BigInt(fileStats.size),
        })
      ) {
        await enqueueJob(LIBRARY_JOB_NAMES.HASH_FILE_ASSET, {
          fileAssetId: upsertedFileAsset.id,
        });
        enqueuedHashJobs.push(upsertedFileAsset.id);
      }
    }

    const missingFileAssetIds: string[] = [];

    for (const existingFileAsset of existingFileAssets) {
      if (seenPaths.has(existingFileAsset.absolutePath)) {
        continue;
      }

      await ingestDb.fileAsset.update({
        where: { id: existingFileAsset.id },
        data: {
          availabilityStatus: AvailabilityStatus.MISSING,
        },
      });
      missingFileAssetIds.push(existingFileAsset.id);
    }

    await ingestDb.libraryRoot.update({
      where: { id: libraryRoot.id },
      data: { lastScannedAt: now },
    });

    return {
      discoveredPaths,
      enqueuedHashJobs,
      missingFileAssetIds,
      scannedFileAssetIds,
    };
  }

  async function hashFileAsset(input: HashFileAssetInput): Promise<HashFileAssetResult> {
    const now = input.now ?? new Date();
    const fileAsset = await ingestDb.fileAsset.findUnique({
      where: { id: input.fileAssetId },
    });

    if (fileAsset === null) {
      throw new Error(`File asset "${input.fileAssetId}" was not found`);
    }

    try {
      const hashes = await hashFile(fileAsset.absolutePath);
      await ingestDb.fileAsset.update({
        where: { id: fileAsset.id },
        data: {
          availabilityStatus: AvailabilityStatus.PRESENT,
          fullHash: hashes.fullHash,
          lastSeenAt: now,
          mtime: hashes.mtime,
          partialHash: hashes.partialHash,
          sizeBytes: hashes.sizeBytes,
        },
      });

      if (fileAsset.mediaKind === MediaKind.EPUB) {
        await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
          fileAssetId: fileAsset.id,
        });
      }

      return {
        availabilityStatus: AvailabilityStatus.PRESENT,
        fileAssetId: fileAsset.id,
        fullHash: hashes.fullHash,
        partialHash: hashes.partialHash,
      };
    } catch (error) {
      const errorCode = getErrorCode(error);

      if (errorCode === "ENOENT") {
        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.MISSING,
            lastSeenAt: now,
          },
        });

        return {
          availabilityStatus: AvailabilityStatus.MISSING,
          fileAssetId: fileAsset.id,
        };
      }

      throw error;
    }
  }

  async function parseFileAssetMetadata(
    input: ParseFileAssetMetadataInput,
  ): Promise<ParseFileAssetMetadataResult> {
    const now = input.now ?? new Date();
    const fileAsset = await ingestDb.fileAsset.findUnique({
      where: { id: input.fileAssetId },
    });

    if (fileAsset === null) {
      throw new Error(`File asset "${input.fileAssetId}" was not found`);
    }

    if (fileAsset.mediaKind !== MediaKind.EPUB) {
      return {
        availabilityStatus: fileAsset.availabilityStatus,
        fileAssetId: fileAsset.id,
        skipped: true,
      };
    }

    try {
      const raw = await parseEpub(fileAsset.absolutePath);
      const metadata: ParsedFileAssetMetadata = {
        normalized: normalizeBookMetadata(raw),
        parsedAt: now.toISOString(),
        parserVersion: EPUB_PARSER_VERSION,
        raw,
        source: "epub",
        status: "parsed",
        warnings: [],
      };

      await ingestDb.fileAsset.update({
        where: { id: fileAsset.id },
        data: {
          availabilityStatus: AvailabilityStatus.PRESENT,
          lastSeenAt: now,
          metadata: metadata as unknown as FileAsset["metadata"],
        },
      });

      await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
        fileAssetId: fileAsset.id,
      });

      return {
        availabilityStatus: AvailabilityStatus.PRESENT,
        fileAssetId: fileAsset.id,
        metadata,
        skipped: false,
      };
    } catch (error) {
      const errorCode = getErrorCode(error);

      if (errorCode === "ENOENT") {
        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.MISSING,
            lastSeenAt: now,
          },
        });

        return {
          availabilityStatus: AvailabilityStatus.MISSING,
          fileAssetId: fileAsset.id,
          skipped: false,
        };
      }

      const warning = error instanceof Error ? error.message : "Unknown EPUB parsing error";
      const metadata: ParsedFileAssetMetadata = {
        parsedAt: now.toISOString(),
        parserVersion: EPUB_PARSER_VERSION,
        source: "epub",
        status: "unparseable",
        warnings: [warning],
      };

      await ingestDb.fileAsset.update({
        where: { id: fileAsset.id },
        data: {
          availabilityStatus: AvailabilityStatus.PRESENT,
          lastSeenAt: now,
          metadata: metadata as unknown as FileAsset["metadata"],
        },
      });

      return {
        availabilityStatus: AvailabilityStatus.PRESENT,
        fileAssetId: fileAsset.id,
        metadata,
        skipped: false,
      };
    }
  }

  async function matchFileAssetToEdition(
    input: MatchFileAssetToEditionInput,
  ): Promise<MatchFileAssetToEditionResult> {
    const fileAsset = await ingestDb.fileAsset.findUnique({
      where: { id: input.fileAssetId },
    });

    if (fileAsset === null || fileAsset.mediaKind !== MediaKind.EPUB) {
      return {
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        fileAssetId: input.fileAssetId,
        skipped: true,
      };
    }

    const existingEditionFile = await ingestDb.editionFile.findFirst({
      where: { fileAssetId: fileAsset.id },
    });

    if (existingEditionFile !== null) {
      const existingEdition = await ingestDb.edition.findUnique({
        where: { id: existingEditionFile.editionId },
      });

      return {
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        editionId: existingEdition?.id,
        fileAssetId: fileAsset.id,
        skipped: false,
        workId: existingEdition?.workId,
      };
    }

    const storedMetadata = parseStoredMetadata(fileAsset.metadata);
    const matchableMetadata = extractNormalizedMetadataForMatching(fileAsset);

    if (storedMetadata?.status !== "parsed" || matchableMetadata === undefined) {
      return {
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        fileAssetId: fileAsset.id,
        skipped: true,
      };
    }

    const identifiers = storedMetadata.normalized?.identifiers;
    const editionMatch =
      (identifiers?.isbn13
        ? await ingestDb.edition.findFirst({ where: { isbn13: identifiers.isbn13 } })
        : null) ??
      (identifiers?.isbn10
        ? await ingestDb.edition.findFirst({ where: { isbn10: identifiers.isbn10 } })
        : null) ??
      (identifiers?.asin
        ? await ingestDb.edition.findFirst({ where: { asin: identifiers.asin } })
        : null);

    if (editionMatch !== null) {
      const createdEditionFile = await ensureEditionFileLink(ingestDb, editionMatch.id, fileAsset.id);
      await enqueueJob(LIBRARY_JOB_NAMES.DETECT_DUPLICATES, {
        editionId: editionMatch.id,
        fileAssetId: fileAsset.id,
      });
      await enqueueJob(LIBRARY_JOB_NAMES.MATCH_AUDIO_LINKS, {
        ebookEditionId: editionMatch.id,
      });

      return {
        createdEdition: false,
        createdEditionFile,
        createdWork: false,
        editionId: editionMatch.id,
        fileAssetId: fileAsset.id,
        skipped: false,
        workId: editionMatch.workId,
      };
    }

    const matchingWorks = await ingestDb.work.findMany({
      include: {
        editions: {
          include: {
            contributors: {
              include: {
                contributor: true,
              },
            },
          },
        },
      },
      where: { titleCanonical: matchableMetadata.titleCanonical },
    });
    const matchingWork = matchingWorks.find((work) => {
      const existingAuthors = getAuthorCanonicalsForWork(work);
      return existingAuthors.length > 0 &&
        existingAuthors.length === matchableMetadata.authorCanonicals.length &&
        existingAuthors.every((author, index) => author === matchableMetadata.authorCanonicals[index]);
    });

    let workId: string;
    let createdWork = false;

    if (matchingWork === undefined) {
      const createdWorkRecord = await ingestDb.work.create({
        data: {
          sortTitle: null,
          titleCanonical: matchableMetadata.titleCanonical,
          titleDisplay: matchableMetadata.title,
        },
      });
      workId = createdWorkRecord.id;
      createdWork = true;
    } else {
      workId = matchingWork.id;
    }

    const createdEdition = await ingestDb.edition.create({
      data: {
        asin: identifiers?.asin ?? null,
        formatFamily: FormatFamily.EBOOK,
        isbn10: identifiers?.isbn10 ?? null,
        isbn13: identifiers?.isbn13 ?? null,
        publishedAt: null,
        publisher: null,
        workId,
      },
    });

    await ensureAuthorContributors(ingestDb, createdEdition.id, matchableMetadata.authors);
    const createdEditionFile = await ensureEditionFileLink(ingestDb, createdEdition.id, fileAsset.id);

    await enqueueJob(LIBRARY_JOB_NAMES.DETECT_DUPLICATES, {
      editionId: createdEdition.id,
      fileAssetId: fileAsset.id,
    });
    await enqueueJob(LIBRARY_JOB_NAMES.MATCH_AUDIO_LINKS, {
      ebookEditionId: createdEdition.id,
    });

    return {
      createdEdition: true,
      createdEditionFile,
      createdWork,
      editionId: createdEdition.id,
      fileAssetId: fileAsset.id,
      skipped: false,
      workId,
    };
  }

  async function detectDuplicates(
    input: DetectDuplicatesInput,
  ): Promise<DetectDuplicatesResult> {
    let scopedFileAssets: DuplicateDetectionFileAssetRecord[] = [];

    if (input.libraryRootId) {
      scopedFileAssets = await duplicateDetectionDb.fileAsset.findMany({
        where: { libraryRootId: input.libraryRootId },
      }) as DuplicateDetectionFileAssetRecord[];
    } else if (input.fileAssetId) {
      const fileAsset = await duplicateDetectionDb.fileAsset.findUnique({
        where: { id: input.fileAssetId },
      });

      scopedFileAssets = fileAsset === null
        ? []
        : await duplicateDetectionDb.fileAsset.findMany({
          where: { libraryRootId: (fileAsset as DuplicateDetectionFileAssetRecord).libraryRootId },
        }) as DuplicateDetectionFileAssetRecord[];
    }

    const scopedFileAssetIds = new Set(scopedFileAssets.map((fileAsset) => fileAsset.id));
    const targetFileAssetIds = new Set<string>(input.fileAssetId ? [input.fileAssetId] : []);

    const editionFiles = scopedFileAssetIds.size === 0
      ? []
      : await duplicateDetectionDb.editionFile.findMany({
        where: {
          fileAssetId: {
            in: [...scopedFileAssetIds],
          },
        },
      });
    const scopedEditionIds = new Set(editionFiles.map((editionFile) => editionFile.editionId));

    if (input.editionId) {
      scopedEditionIds.add(input.editionId);
    }

    const targetEditionIds = new Set<string>(input.editionId ? [input.editionId] : []);
    for (const editionFile of editionFiles) {
      if (targetFileAssetIds.has(editionFile.fileAssetId)) {
        targetEditionIds.add(editionFile.editionId);
      }
    }

    const scopedEditions = scopedEditionIds.size === 0
      ? []
      : await duplicateDetectionDb.edition.findMany({
        where: {
          id: {
            in: [...scopedEditionIds],
          },
        },
        include: {
          contributors: {
            include: {
              contributor: true,
            },
          },
          editionFiles: {
            include: {
              fileAsset: true,
            },
          },
          work: true,
        },
      });
    const candidateMap = new Map<
      string,
      {
        confidence: number;
        leftEditionId?: string;
        leftFileAssetId?: string;
        reason: DuplicateReason;
        rightEditionId?: string;
        rightFileAssetId?: string;
      }
    >();

    const isFullRecompute = input.libraryRootId !== undefined;
    const shouldConsiderFilePair = (leftFileId: string, rightFileId: string) =>
      isFullRecompute || targetFileAssetIds.has(leftFileId) || targetFileAssetIds.has(rightFileId);
    const shouldConsiderEditionPair = (leftEditionId: string, rightEditionId: string) =>
      isFullRecompute || targetEditionIds.has(leftEditionId) || targetEditionIds.has(rightEditionId);

    const presentFileAssets = scopedFileAssets.filter((fileAsset) =>
      fileAsset.availabilityStatus === AvailabilityStatus.PRESENT &&
      fileAsset.fullHash !== null,
    );
    const fileAssetsByHash = new Map<string, DuplicateDetectionFileAssetRecord[]>();

    for (const fileAsset of presentFileAssets) {
      const filesWithSameHash = fileAssetsByHash.get(fileAsset.fullHash as string) ?? [];
      filesWithSameHash.push(fileAsset);
      fileAssetsByHash.set(fileAsset.fullHash as string, filesWithSameHash);
    }

    for (const filesWithSameHash of fileAssetsByHash.values()) {
      for (let index = 0; index < filesWithSameHash.length; index += 1) {
        for (let innerIndex = index + 1; innerIndex < filesWithSameHash.length; innerIndex += 1) {
          const [leftFileId, rightFileId] = orderPair(
            filesWithSameHash[index]!.id,
            filesWithSameHash[innerIndex]!.id,
          );

          if (!shouldConsiderFilePair(leftFileId, rightFileId)) {
            continue;
          }

          const candidate = {
            confidence: 1,
            leftFileAssetId: leftFileId,
            reason: DuplicateReason.SAME_HASH,
            rightFileAssetId: rightFileId,
          };
          candidateMap.set(createDuplicateCandidateKey(candidate), candidate);
        }
      }
    }

    const ebookEditions = scopedEditions.filter((edition) => edition.formatFamily === FormatFamily.EBOOK);
    const isbnBuckets = new Map<string, DuplicateDetectionEditionRecord[]>();

    for (const edition of ebookEditions) {
      for (const isbn of [edition.isbn13, edition.isbn10]) {
        if (isbn === null) {
          continue;
        }

        const bucketKey = `${isbn.length}:${isbn}`;
        const editionsWithSameIsbn = isbnBuckets.get(bucketKey) ?? [];
        editionsWithSameIsbn.push(edition);
        isbnBuckets.set(bucketKey, editionsWithSameIsbn);
      }
    }

    for (const editionsWithSameIsbn of isbnBuckets.values()) {
      for (let index = 0; index < editionsWithSameIsbn.length; index += 1) {
        for (let innerIndex = index + 1; innerIndex < editionsWithSameIsbn.length; innerIndex += 1) {
          const leftEdition = editionsWithSameIsbn[index]!;
          const rightEdition = editionsWithSameIsbn[innerIndex]!;
          const [leftEditionId, rightEditionId] = orderPair(leftEdition.id, rightEdition.id);

          if (!shouldConsiderEditionPair(leftEditionId, rightEditionId)) {
            continue;
          }

          const candidate = {
            confidence: 1,
            leftEditionId,
            reason: DuplicateReason.SAME_ISBN,
            rightEditionId,
          };
          candidateMap.set(createDuplicateCandidateKey(candidate), candidate);
        }
      }
    }

    for (let index = 0; index < ebookEditions.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < ebookEditions.length; innerIndex += 1) {
        const leftEdition = ebookEditions[index]!;
        const rightEdition = ebookEditions[innerIndex]!;
        const [leftEditionId, rightEditionId] = orderPair(leftEdition.id, rightEdition.id);

        if (
          !shouldConsiderEditionPair(leftEditionId, rightEditionId) ||
          !canBeSameEditionDuplicate(leftEdition, rightEdition)
        ) {
          continue;
        }

        const candidate = {
          confidence: buildFuzzyDuplicateConfidence(leftEdition, rightEdition),
          leftEditionId,
          reason: DuplicateReason.SIMILAR_TITLE_AUTHOR,
          rightEditionId,
        };
        candidateMap.set(createDuplicateCandidateKey(candidate), candidate);
      }
    }

    const existingCandidates = await duplicateDetectionDb.duplicateCandidate.findMany({
      where: {
        OR: [
          targetEditionIds.size > 0 ? {
            leftEditionId: {
              in: [...targetEditionIds],
            },
          } : undefined,
          targetEditionIds.size > 0 ? {
            rightEditionId: {
              in: [...targetEditionIds],
            },
          } : undefined,
          targetFileAssetIds.size > 0 ? {
            leftFileAssetId: {
              in: [...targetFileAssetIds],
            },
          } : undefined,
          targetFileAssetIds.size > 0 ? {
            rightFileAssetId: {
              in: [...targetFileAssetIds],
            },
          } : undefined,
          input.libraryRootId ? {
            OR: [
              {
                leftFileAssetId: {
                  in: [...scopedFileAssetIds],
                },
              },
              {
                rightFileAssetId: {
                  in: [...scopedFileAssetIds],
                },
              },
              {
                leftEditionId: {
                  in: [...scopedEditionIds],
                },
              },
              {
                rightEditionId: {
                  in: [...scopedEditionIds],
                },
              },
            ],
          } : undefined,
        ].filter(Boolean),
      },
    });
    const existingByKey = new Map(
      existingCandidates.map((candidate) => [createDuplicateCandidateKey(candidate), candidate]),
    );
    const createdCandidateIds: string[] = [];
    const updatedCandidateIds: string[] = [];
    const ignoredCandidateIds: string[] = [];

    for (const [candidateKey, candidate] of candidateMap.entries()) {
      const existing = existingByKey.get(candidateKey);

      if (existing === undefined) {
        const created = await duplicateDetectionDb.duplicateCandidate.create({
          data: {
            confidence: candidate.confidence,
            leftEditionId: candidate.leftEditionId ?? null,
            leftFileAssetId: candidate.leftFileAssetId ?? null,
            reason: candidate.reason,
            rightEditionId: candidate.rightEditionId ?? null,
            rightFileAssetId: candidate.rightFileAssetId ?? null,
            status: ReviewStatus.PENDING,
          },
        });
        createdCandidateIds.push(created.id);
        continue;
      }

      const nextStatus = shouldPreserveCandidateStatus(existing.status)
        ? existing.status
        : ReviewStatus.PENDING;
      const updated = await duplicateDetectionDb.duplicateCandidate.update({
        where: { id: existing.id },
        data: {
          confidence: candidate.confidence,
          status: nextStatus,
        },
      });
      updatedCandidateIds.push(updated.id);
      existingByKey.delete(candidateKey);
    }

    for (const staleCandidate of existingByKey.values()) {
      if (staleCandidate.status !== ReviewStatus.PENDING) {
        continue;
      }

      const updated = await duplicateDetectionDb.duplicateCandidate.update({
        where: { id: staleCandidate.id },
        data: {
          status: ReviewStatus.IGNORED,
        },
      });
      ignoredCandidateIds.push(updated.id);
    }

    return {
      createdCandidateIds,
      ignoredCandidateIds,
      scannedEditionIds: [...scopedEditionIds],
      scannedFileAssetIds: [...scopedFileAssetIds],
      updatedCandidateIds,
    };
  }

  async function matchAudioLinks(
    input: MatchAudioLinksInput,
  ): Promise<AudioLinkMatchResult> {
    const scopedEditions: AudioMatchingEditionRecord[] = input.libraryRootId !== undefined
      ? await (async () => {
      const scopedFileAssets = await audioMatchingDb.fileAsset.findMany({
        where: { libraryRootId: input.libraryRootId },
      });
      const scopedFileAssetIds = scopedFileAssets.map((fileAsset) => fileAsset.id);
      const scopedEditionFiles = scopedFileAssetIds.length === 0
        ? []
        : await audioMatchingDb.editionFile.findMany({
          where: {
            fileAssetId: {
              in: scopedFileAssetIds,
            },
          },
        });
      const scopedEditionIds = [...new Set(scopedEditionFiles.map((editionFile) => editionFile.editionId))];

        return scopedEditionIds.length === 0
        ? []
        : await audioMatchingDb.edition.findMany({
          where: {
            id: {
              in: scopedEditionIds,
            },
          },
        });
      })()
      : await audioMatchingDb.edition.findMany({});

    const targetEbookEditionIds = new Set<string>(
      [input.ebookEditionId].filter((value): value is string => value !== undefined),
    );
    const targetAudioEditionIds = new Set<string>(
      [input.audioEditionId].filter((value): value is string => value !== undefined),
    );
    const isFullRecompute =
      input.libraryRootId !== undefined ||
      (targetEbookEditionIds.size === 0 && targetAudioEditionIds.size === 0);
    const shouldConsiderPair = (ebookEditionId: string, audioEditionId: string) =>
      isFullRecompute ||
      targetEbookEditionIds.has(ebookEditionId) ||
      targetAudioEditionIds.has(audioEditionId);

    const ebookEditions = scopedEditions.filter((edition) => edition.formatFamily === FormatFamily.EBOOK);
    const audioEditions = scopedEditions.filter((edition) => edition.formatFamily === FormatFamily.AUDIOBOOK);
    const linkMap = new Map<string, {
      audioEditionId: string;
      confidence: number;
      ebookEditionId: string;
      matchType: AudioLinkMatchType;
    }>();

    for (const ebookEdition of ebookEditions) {
      for (const audioEdition of audioEditions) {
        if (!shouldConsiderPair(ebookEdition.id, audioEdition.id)) {
          continue;
        }

        const matchType = canLinkAudioEditions(ebookEdition, audioEdition);

        if (matchType === undefined) {
          continue;
        }

        const candidate = {
          audioEditionId: audioEdition.id,
          confidence: buildAudioMatchConfidence(matchType),
          ebookEditionId: ebookEdition.id,
          matchType,
        };
        linkMap.set(createAudioLinkKey(candidate), candidate);
      }
    }

    const scopedEditionIds = new Set(scopedEditions.map((edition) => edition.id));
    const existingAudioLinks = await audioMatchingDb.audioLink.findMany({
      where: {
        OR: [
          targetEbookEditionIds.size > 0
            ? {
              ebookEditionId: {
                in: [...targetEbookEditionIds],
              },
            }
            : undefined,
          targetAudioEditionIds.size > 0
            ? {
              audioEditionId: {
                in: [...targetAudioEditionIds],
              },
            }
            : undefined,
          input.libraryRootId
            ? {
              OR: [
                {
                  ebookEditionId: {
                    in: [...scopedEditionIds],
                  },
                },
                {
                  audioEditionId: {
                    in: [...scopedEditionIds],
                  },
                },
              ],
            }
            : undefined,
        ].filter(Boolean),
      },
    });
    const existingByKey = new Map(
      existingAudioLinks.map((audioLink) => [createAudioLinkKey(audioLink), audioLink]),
    );
    const createdAudioLinkIds: string[] = [];
    const updatedAudioLinkIds: string[] = [];
    const ignoredAudioLinkIds: string[] = [];

    for (const [audioLinkKey, audioLink] of linkMap.entries()) {
      const existing = existingByKey.get(audioLinkKey);

      if (existing === undefined) {
        const created = await audioMatchingDb.audioLink.create({
          data: {
            audioEditionId: audioLink.audioEditionId,
            confidence: audioLink.confidence,
            ebookEditionId: audioLink.ebookEditionId,
            matchType: audioLink.matchType,
            reviewStatus: ReviewStatus.PENDING,
          },
        });
        createdAudioLinkIds.push(created.id);
        continue;
      }

      const nextStatus = shouldPreserveCandidateStatus(existing.reviewStatus)
        ? existing.reviewStatus
        : ReviewStatus.PENDING;
      const updated = await audioMatchingDb.audioLink.update({
        where: { id: existing.id },
        data: {
          confidence: audioLink.confidence,
          matchType: audioLink.matchType,
          reviewStatus: nextStatus,
        },
      });
      updatedAudioLinkIds.push(updated.id);
      existingByKey.delete(audioLinkKey);
    }

    for (const staleAudioLink of existingByKey.values()) {
      if (staleAudioLink.reviewStatus !== ReviewStatus.PENDING) {
        continue;
      }

      const updated = await audioMatchingDb.audioLink.update({
        where: { id: staleAudioLink.id },
        data: {
          reviewStatus: ReviewStatus.IGNORED,
        },
      });
      ignoredAudioLinkIds.push(updated.id);
    }

    return {
      createdAudioLinkIds,
      ignoredAudioLinkIds,
      scannedAudioEditionIds: audioEditions.map((edition) => edition.id),
      scannedEbookEditionIds: ebookEditions.map((edition) => edition.id),
      updatedAudioLinkIds,
    };
  }

  return {
    detectDuplicates,
    hashFileAsset,
    matchAudioLinks,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    scanLibraryRoot,
  };
}

const services = createIngestServices();

export const scanLibraryRoot = services.scanLibraryRoot;
export const hashFileAsset = services.hashFileAsset;
export const matchAudioLinks = services.matchAudioLinks;
export const matchFileAssetToEdition = services.matchFileAssetToEdition;
export const parseFileAssetMetadata = services.parseFileAssetMetadata;
export const detectDuplicates = services.detectDuplicates;

export const DUPLICATE_INTERNALS = {
  buildFuzzyDuplicateConfidence,
  canBeSameEditionDuplicate,
  createDuplicateCandidateKey,
};
export const AUDIO_LINK_INTERNALS = {
  buildAudioMatchConfidence,
  canLinkAudioEditions,
  createAudioLinkKey,
};
export { classifyMediaKind, getFileExtension, hashFileContents, isFileChanged, normalizeRelativePath, normalizeRootPath, walkRegularFiles };
export { parseEpubMetadata } from "./epub";
export {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  createIdentifierMap,
  normalizeBookMetadata,
} from "./metadata";
export type { NormalizedBookMetadata, ParsedEpubMetadataRaw };
