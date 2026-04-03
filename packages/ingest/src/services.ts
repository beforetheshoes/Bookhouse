import path from "node:path";
import type { Dirent, Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import {
  AvailabilityStatus,
  ContributorRole,
  EditionFileRole,
  FormatFamily,
  type Contributor,
  type Edition,
  type EditionFile,
  type FileAsset,
  MediaKind,
  type LibraryRoot,
  ScanMode,
  type Work,
} from "@bookhouse/domain";
import { db, type EditionContributor } from "@bookhouse/db";
import {
  createLogger,
  LIBRARY_JOB_NAMES,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  enqueueLibraryJob,
} from "@bookhouse/shared";
import { classifyMediaKind, deriveFormatFamily, getFileExtension, IGNORED_BASENAMES, isIgnoredBasename, normalizeRelativePath, normalizeRootPath } from "./classification";
import { normalizedSimilarity, normalizeForTitleMatching, stripSubtitleForMatching } from "./similarity";
import { deriveTitleFromPath } from "./filename-title";
import {
  parseAudiobookMetadataJson,
  parseAudioId3Tags,
  type ParsedAudiobookMetadataJsonRaw,
  type ParsedAudioId3TagsRaw,
} from "./audiobook";
import { parseEpubMetadata, type ParsedEpubMetadataRaw } from "./epub";
import { parseOpfSidecar, type ParsedOpfMetadataRaw } from "./opf";
import { hashFileContents } from "./hashing";
import {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  normalizeAudiobookMetadata,
  normalizeBookMetadata,
  normalizeOpfMetadata,
  type NormalizedBookMetadata,
} from "./metadata";

export interface ParsedFileAssetMetadata {
  normalized?: NormalizedBookMetadata;
  parsedAt: string;
  parserVersion: number;
  raw?: ParsedEpubMetadataRaw | ParsedOpfMetadataRaw | ParsedAudiobookMetadataJsonRaw | ParsedAudioId3TagsRaw;
  source: "epub" | "opf-sidecar" | "audiobook-json" | "audio-id3" | "filename";
  status: "parsed" | "unparseable";
  warnings: string[];
}

type FileAssetRecord = Pick<
  FileAsset,
  | "absolutePath"
  | "availabilityStatus"
  | "basename"
  | "fullHash"
  | "id"
  | "mediaKind"
  | "mtime"
  | "metadata"
  | "partialHash"
  | "relativePath"
  | "sizeBytes"
>;

type LibraryRootRecord = Pick<LibraryRoot, "id" | "lastScannedAt" | "path" | "scanMode">;
type WorkRecord = Pick<Work, "coverPath" | "description" | "enrichmentStatus" | "id" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">;
type EditionRecord = Pick<
  Edition,
  "asin" | "formatFamily" | "id" | "isbn10" | "isbn13" | "language" | "publishedAt" | "publisher" | "workId"
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

interface DuplicateCandidateRecord {
  id: string;
  leftEditionId: string | null;
  rightEditionId: string | null;
  leftFileAssetId: string | null;
  rightFileAssetId: string | null;
  reason: string;
  confidence: number | null;
  status: string;
}

interface MatchSuggestionRecord {
  id: string;
  targetWorkId: string;
  suggestedWorkId: string;
  matchType: string;
  confidence: number | null;
  reviewStatus: string;
}

interface MatchSuggestionCreateArgs {
  data: {
    targetWorkId: string;
    suggestedWorkId: string;
    matchType: string;
    confidence: number;
  };
}

interface MatchSuggestionFindFirstArgs {
  where: {
    targetWorkId?: string;
    suggestedWorkId?: string;
  };
}

interface DuplicateCandidateCreateArgs {
  data: {
    leftEditionId?: string;
    rightEditionId?: string;
    leftFileAssetId?: string;
    rightFileAssetId?: string;
    reason: string;
    confidence: number | null;
  };
}

interface DuplicateCandidateFindFirstArgs {
  where: {
    OR: Array<{
      leftEditionId?: string;
      rightEditionId?: string;
      leftFileAssetId?: string;
      rightFileAssetId?: string;
    }>;
  };
}

interface LibraryRootFindUniqueArgs {
  where: { id: string };
}

interface FileAssetFindManyArgs {
  where: { libraryRootId: string } | { fullHash: string; NOT: { id: string } };
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

interface FileAssetUpdateManyArgs {
  where: { id: { in: string[] } };
  data: Partial<FileAssetUpdateInput>;
}

interface WorkFindManyArgs {
  where: { titleCanonical: string } | { NOT: { id: string } };
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
  data: Pick<WorkRecord, "sortTitle" | "titleCanonical" | "titleDisplay"> & Partial<Pick<WorkRecord, "enrichmentStatus">>;
}

interface EditionFindFirstArgs {
  where: Partial<Pick<EditionRecord, "asin" | "id" | "isbn10" | "isbn13">>;
}

interface EditionFindManyArgs {
  where: {
    OR: Array<Partial<Pick<EditionRecord, "isbn13" | "isbn10">>>;
    NOT: { id: string };
    formatFamily: string;
  };
}

interface EditionCreateArgs {
  data: Pick<
    EditionRecord,
    "asin" | "formatFamily" | "isbn10" | "isbn13" | "language" | "publishedAt" | "publisher" | "workId"
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

interface EditionFileFindManyArgs {
  where: { fileAssetId?: string | { in: string[] }; editionId?: string };
}

interface EditionFileUpdateArgs {
  where: { id: string };
  data: { fileAssetId: string };
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
  data: { lastScannedAt: Date; scanMode?: ScanMode };
}

export interface IngestDb {
  libraryRoot: {
    findUnique(args: LibraryRootFindUniqueArgs): Promise<LibraryRootRecord | null>;
    update(args: LibraryRootUpdateArgs): Promise<LibraryRootRecord>;
  };
  fileAsset: {
    findByDirectory(args: { directoryPath: string; mediaKinds: MediaKind[] }): Promise<FileAssetRecord[]>;
    findMany(args: FileAssetFindManyArgs): Promise<FileAssetRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<FileAssetRecord | null>;
    update(args: FileAssetUpdateArgs): Promise<FileAssetRecord>;
    updateMany(args: FileAssetUpdateManyArgs): Promise<{ count: number }>;
    upsert(args: FileAssetUpsertArgs): Promise<FileAssetRecord>;
  };
  work: {
    create(args: WorkCreateArgs): Promise<WorkRecord>;
    delete(args: { where: { id: string } }): Promise<void>;
    findMany(args: WorkFindManyArgs): Promise<WorkMatchRecord[]>;
    findManyByIds(args: { ids: string[] }): Promise<WorkRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<WorkRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<Work, "coverPath" | "description" | "enrichmentStatus" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">> }): Promise<WorkRecord>;
  };
  edition: {
    create(args: EditionCreateArgs): Promise<EditionRecord>;
    findFirst(args: EditionFindFirstArgs): Promise<EditionRecord | null>;
    findMany(args: EditionFindManyArgs): Promise<EditionRecord[]>;
    findManyByIds(args: { ids: string[] }): Promise<EditionRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<EditionRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<Edition, "asin" | "isbn10" | "isbn13" | "language" | "publisher" | "publishedAt" | "workId">> }): Promise<EditionRecord>;
    updateMany(args: { where: { workId: string }; data: { workId: string } }): Promise<{ count: number }>;
  };
  series: {
    upsert(args: { name: string }): Promise<{ id: string; name: string }>;
  };
  editionFile: {
    create(args: EditionFileCreateArgs): Promise<EditionFileRecord>;
    findFirst(args: EditionFileFindFirstArgs): Promise<EditionFileRecord | null>;
    findMany(args: EditionFileFindManyArgs): Promise<EditionFileRecord[]>;
    update(args: EditionFileUpdateArgs): Promise<EditionFileRecord>;
  };
  contributor: {
    create(args: ContributorCreateArgs): Promise<ContributorRecord>;
    findMany(args: ContributorFindManyArgs): Promise<ContributorRecord[]>;
  };
  editionContributor: {
    create(args: EditionContributorCreateArgs): Promise<EditionContributorRecord>;
    findFirst(args: EditionContributorFindFirstArgs): Promise<EditionContributorRecord | null>;
  };
  duplicateCandidate: {
    create(args: DuplicateCandidateCreateArgs): Promise<DuplicateCandidateRecord>;
    findFirst(args: DuplicateCandidateFindFirstArgs): Promise<DuplicateCandidateRecord | null>;
  };
  matchSuggestion: {
    create(args: MatchSuggestionCreateArgs): Promise<MatchSuggestionRecord>;
    findFirst(args: MatchSuggestionFindFirstArgs): Promise<MatchSuggestionRecord | null>;
  };
}

export interface IngestLogger {
  info(obj: Record<string, string | number | boolean | null>, msg: string): void;
  warn(obj: Record<string, string | number | boolean | null>, msg: string): void;
}

export interface IngestDependencies {
  db: IngestDb;
  enqueueLibraryJob<TName extends LibraryJobName>(
    jobName: TName,
    payload: LibraryJobPayload<TName>,
  ): Promise<string | undefined>;
  listDirectory: ListDirectoryFn;
  logger: IngestLogger;
  readStats: ReadStatsFn;
  hashFile: typeof hashFileContents;
  parseEpub: typeof parseEpubMetadata;
  parseOpf: typeof parseOpfSidecar;
  parseAudiobookJson: typeof parseAudiobookMetadataJson;
  parseAudioId3: typeof parseAudioId3Tags;
}

export interface ScanProgressData {
  totalFiles?: number;
  processedFiles?: number;
  errorCount?: number;
  scanStage?: "DISCOVERY" | "PROCESSING";
}

export interface ScanLibraryRootInput {
  libraryRootId: string;
  scanMode?: ScanMode;
  now?: Date;
  reportProgress?: (data: ScanProgressData) => Promise<void>;
}

export interface ScanLibraryRootResult {
  createdStubWorkIds: string[];
  discoveredPaths: string[];
  enqueuedHashJobs: string[];
  enqueuedRecoveryJobs: string[];
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
  movedFromFileAssetId?: string;
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
  enrichedExistingWork: boolean;
  enqueuedCoverJob: boolean;
  fileAssetId: string;
  mediaKind?: string;
  mergedIntoWorkId?: string;
  skipped: boolean;
  workId?: string;
}

export interface DetectDuplicatesInput {
  fileAssetId: string;
}

export interface DetectDuplicatesResult {
  fileAssetId: string;
  skipped: boolean;
  candidatesCreated: number;
}

export interface MatchSuggestionsInput {
  fileAssetId: string;
}

export interface MatchSuggestionsResult {
  fileAssetId: string;
  skipped: boolean;
  linksCreated: number;
}

const EPUB_PARSER_VERSION = 1;
const OPF_PARSER_VERSION = 1;
const AUDIOBOOK_JSON_PARSER_VERSION = 1;
const AUDIO_ID3_PARSER_VERSION = 1;
export const SCAN_PROGRESS_INTERVAL = 50;
const SCAN_STAT_CONCURRENCY = 8;


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

function didFileStatsChange(existingFileAsset: FileAssetRecord | undefined, nextFileState: { mtime: Date; sizeBytes: bigint }): boolean {
  if (existingFileAsset === undefined) {
    return true;
  }

  if (existingFileAsset.sizeBytes !== nextFileState.sizeBytes) {
    return true;
  }

  return existingFileAsset.mtime?.getTime() !== nextFileState.mtime.getTime();
}

interface ScanPathStatsResult {
  absolutePath: string;
  fileStats?: Stats;
  statFailed: boolean;
}

async function collectScanPathStats(
  discoveredPaths: string[],
  readStats: ReadStatsFn,
  logger?: IngestLogger,
): Promise<ScanPathStatsResult[]> {
  const results = new Array<ScanPathStatsResult>(discoveredPaths.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < discoveredPaths.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const absolutePath = discoveredPaths[currentIndex] as string;

      try {
        results[currentIndex] = {
          absolutePath,
          fileStats: await readStats(absolutePath),
          statFailed: false,
        };
      } catch (error) {
        logger?.warn(
          { err: error instanceof Error ? error.message : String(error), path: absolutePath },
          "Failed to stat path",
        );
        results[currentIndex] = {
          absolutePath,
          statFailed: true,
        };
      }
    }
  }

  const workerCount = Math.min(SCAN_STAT_CONCURRENCY, discoveredPaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function buildFileAssetsByDirectory(fileAssets: FileAssetRecord[]): Map<string, FileAssetRecord[]> {
  const fileAssetsByDirectory = new Map<string, FileAssetRecord[]>();

  for (const fileAsset of fileAssets) {
    const directoryPath = path.dirname(fileAsset.absolutePath);
    const directoryAssets = fileAssetsByDirectory.get(directoryPath) ?? [];
    directoryAssets.push(fileAsset);
    fileAssetsByDirectory.set(directoryPath, directoryAssets);
  }

  return fileAssetsByDirectory;
}

function setDirectoryFileAsset(
  fileAssetsByDirectory: Map<string, FileAssetRecord[]>,
  fileAsset: FileAssetRecord,
): void {
  const directoryPath = path.dirname(fileAsset.absolutePath);
  const directoryAssets = fileAssetsByDirectory.get(directoryPath) ?? [];
  const nextDirectoryAssets = directoryAssets.filter(
    (directoryAsset) => directoryAsset.id !== fileAsset.id && directoryAsset.absolutePath !== fileAsset.absolutePath,
  );
  nextDirectoryAssets.push(fileAsset);
  fileAssetsByDirectory.set(directoryPath, nextDirectoryAssets);
}

interface NodeError extends Error {
  code?: string;
}

function getErrorCode(error: NodeError): string | undefined {
  return error.code;
}

/** Transient infrastructure errors that should be retried, not permanently stored as "unparseable". */
const TRANSIENT_ERROR_CODES = new Set([
  "ENOTCONN",    // socket not connected (NFS/network filesystem)
  "ECONNRESET",  // connection reset by peer
  "ECONNREFUSED",// connection refused
  "ETIMEDOUT",   // operation timed out
  "EIO",         // I/O error (disk/network issue)
  "EPIPE",       // broken pipe
  "ENETUNREACH", // network unreachable
  "EHOSTUNREACH",// host unreachable
  "ECONNABORTED",// connection aborted
]);

function isTransientError(error: NodeError): boolean {
  const code = getErrorCode(error);
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
}

function parseStoredMetadata(metadata: FileAsset["metadata"]): ParsedFileAssetMetadata | undefined {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const candidate = metadata;
  const source = candidate["source"];
  const status = candidate["status"];

  if (
    (source !== "epub" && source !== "opf-sidecar" && source !== "audiobook-json" && source !== "audio-id3" && source !== "filename") ||
    (status !== "parsed" && status !== "unparseable")
  ) {
    return undefined;
  }

  return candidate as object as ParsedFileAssetMetadata;
}

const EBOOK_VARIANT_MEDIA_KINDS = new Set<MediaKind>([
  MediaKind.KEPUB,
  MediaKind.MOBI,
  MediaKind.AZW,
  MediaKind.AZW3,
]);

function isEbookVariant(mediaKind: MediaKind): boolean {
  return EBOOK_VARIANT_MEDIA_KINDS.has(mediaKind);
}

const PATH_DERIVED_EBOOK_MEDIA_KINDS = new Set<MediaKind>([
  MediaKind.KEPUB,
  MediaKind.MOBI,
  MediaKind.AZW,
  MediaKind.AZW3,
]);

function usesPathDerivedEbookMetadata(mediaKind: MediaKind): boolean {
  return PATH_DERIVED_EBOOK_MEDIA_KINDS.has(mediaKind);
}

const SCAN_GROUPED_EBOOK_MEDIA_KINDS = new Set<MediaKind>([
  MediaKind.EPUB,
  MediaKind.KEPUB,
  MediaKind.MOBI,
  MediaKind.AZW,
  MediaKind.AZW3,
]);

function groupsWithSiblingEbookVariants(mediaKind: MediaKind): boolean {
  return SCAN_GROUPED_EBOOK_MEDIA_KINDS.has(mediaKind);
}

function normalizePathSegment(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/(?<!\s)-(?!\s)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveEbookVariantMetadataFromPath(filePath: string): NormalizedBookMetadata {
  const directoryPath = path.dirname(filePath);
  const rawTitleSource = directoryPath === "."
    ? path.basename(filePath, path.extname(filePath))
    : path.basename(directoryPath);
  const { title } = deriveTitleFromPath(rawTitleSource, MediaKind.EPUB);
  const rawAuthorSource = directoryPath === "." ? "" : path.basename(path.dirname(directoryPath));
  const author = normalizePathSegment(rawAuthorSource);

  return {
    authors: author === "" ? [] : [author],
    identifiers: { unknown: [] },
    title,
  };
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

function computeAuthorSimilarity(authorsA: string[], authorsB: string[]): number {
  if (authorsA.length === 0 || authorsB.length === 0) return 0;
  // Best pairwise match: if any author from A fuzzy-matches any author from B
  let bestSim = 0;
  for (const a of authorsA) {
    for (const b of authorsB) {
      bestSim = Math.max(bestSim, normalizedSimilarity(a, b));
    }
  }
  return bestSim;
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

async function ensureEditionFileLink(
  ingestDb: IngestDb,
  editionId: string,
  fileAssetId: string,
  role: EditionFileRole = EditionFileRole.PRIMARY,
): Promise<boolean> {
  await ingestDb.editionFile.create({
    data: {
      editionId,
      fileAssetId,
      role,
    },
  });

  return true;
}

async function determineEditionFileRole(
  ingestDb: IngestDb,
  editionId: string,
  fileAsset: FileAssetRecord,
): Promise<EditionFileRole> {
  if (fileAsset.mediaKind === MediaKind.AUDIO) {
    return EditionFileRole.AUDIO_TRACK;
  }

  const existingEditionFiles = await ingestDb.editionFile.findMany({
    where: { editionId },
  });

  if (existingEditionFiles.length === 0) {
    return EditionFileRole.PRIMARY;
  }

  if (isEbookVariant(fileAsset.mediaKind)) {
    return EditionFileRole.ALTERNATE_FORMAT;
  }

  return EditionFileRole.PRIMARY;
}

async function ensureContributors(
  ingestDb: IngestDb,
  editionId: string,
  names: string[],
  role: ContributorRole,
): Promise<void> {
  const normalizedNames = names
    .map((nameDisplay) => ({
      nameCanonical: canonicalizeContributorName(nameDisplay),
      nameDisplay,
    }))
    .filter(
      (entry): entry is { nameCanonical: string; nameDisplay: string } =>
        entry.nameCanonical !== undefined,
    );

  const contributorsByCanonical = new Map(
    (
      await ingestDb.contributor.findMany({
        where: {
          nameCanonical: {
            in: [...new Set(normalizedNames.map((entry) => entry.nameCanonical))],
          },
        },
      })
    ).map((contributor) => [contributor.nameCanonical, contributor]),
  );

  for (const entry of normalizedNames) {
    let contributor = contributorsByCanonical.get(entry.nameCanonical);

    if (contributor === undefined) {
      contributor = await ingestDb.contributor.create({
        data: entry,
      });
      contributorsByCanonical.set(contributor.nameCanonical, contributor);
    }

    const existingLink = await ingestDb.editionContributor.findFirst({
      where: {
        contributorId: contributor.id,
        editionId,
        role,
      },
    });

    if (existingLink === null) {
      await ingestDb.editionContributor.create({
        data: {
          contributorId: contributor.id,
          editionId,
          role,
        },
      });
    }
  }
}

type ListDirectoryFn = (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
type ReadStatsFn = (path: string) => Promise<Stats>;

async function walkRegularFiles(
  rootPath: string,
  listDirectory: ListDirectoryFn,
  readStats: ReadStatsFn,
  logger?: IngestLogger,
): Promise<string[]> {
  const pendingDirectories = [normalizeRootPath(rootPath)];
  const files: string[] = [];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop() as string;

    let entries: Dirent[];

    try {
      entries = await listDirectory(currentDirectory, { withFileTypes: true });
    } catch (error) {
      logger?.warn(
        { err: error instanceof Error ? error.message : String(error), path: currentDirectory },
        "Failed to list directory",
      );
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
        if (!isIgnoredBasename(entry.name)) {
          files.push(absolutePath);
        }
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

function createDefaultIngestDb(): IngestDb {
  const prisma = db;
  return {
    libraryRoot: prisma.libraryRoot as object as IngestDb["libraryRoot"],
    fileAsset: {
      ...(prisma.fileAsset as object as Omit<IngestDb["fileAsset"], "findByDirectory">),
      async findByDirectory(args: { directoryPath: string; mediaKinds: MediaKind[] }) {
        return prisma.fileAsset.findMany({
          where: {
            absolutePath: { startsWith: args.directoryPath + "/" },
            mediaKind: { in: args.mediaKinds },
          },
        }) as object as Promise<FileAssetRecord[]>;
      },
      async updateMany(args: FileAssetUpdateManyArgs) {
        return prisma.fileAsset.updateMany(args as never) as object as Promise<{ count: number }>;
      },
    },
    work: {
      ...(prisma.work as object as Omit<IngestDb["work"], "findManyByIds" | "update">),
      async findManyByIds(args: { ids: string[] }) {
        return prisma.work.findMany({
          where: { id: { in: args.ids } },
        }) as object as Promise<WorkRecord[]>;
      },
      async update(args: { where: { id: string }; data: Partial<Pick<Work, "coverPath" | "description" | "enrichmentStatus" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">> }) {
        return prisma.work.update(args) as object as Promise<WorkRecord>;
      },
    },
    edition: {
      ...(prisma.edition as object as Omit<IngestDb["edition"], "findManyByIds" | "update">),
      async findManyByIds(args: { ids: string[] }) {
        return prisma.edition.findMany({
          where: { id: { in: args.ids } },
        }) as object as Promise<EditionRecord[]>;
      },
      async update(args: { where: { id: string }; data: Partial<Pick<Edition, "asin" | "isbn10" | "isbn13" | "publisher" | "publishedAt" | "workId">> }) {
        return prisma.edition.update(args) as object as Promise<EditionRecord>;
      },
    },
    editionFile: prisma.editionFile as object as IngestDb["editionFile"],
    contributor: prisma.contributor as object as IngestDb["contributor"],
    editionContributor: prisma.editionContributor as object as IngestDb["editionContributor"],
    series: {
      async upsert(args: { name: string }) {
        const existing = await prisma.series.findFirst({ where: { name: args.name } });
        if (existing) return { id: existing.id, name: existing.name };
        const created = await prisma.series.create({ data: { name: args.name } });
        return { id: created.id, name: created.name };
      },
    },
    duplicateCandidate: prisma.duplicateCandidate as object as IngestDb["duplicateCandidate"],
    matchSuggestion: prisma.matchSuggestion as object as IngestDb["matchSuggestion"],
  };
}

interface ScanRecoveryContext {
  editionById: Map<string, EditionRecord>;
  editionFileByFileAssetId: Map<string, EditionFileRecord>;
  fileAssetsByDirectory: Map<string, FileAssetRecord[]>;
  workById: Map<string, WorkRecord>;
}

function addRecoveryJobIdOnce(enqueuedRecoveryJobs: string[], fileAssetId: string): void {
  if (!enqueuedRecoveryJobs.includes(fileAssetId)) {
    enqueuedRecoveryJobs.push(fileAssetId);
  }
}

async function recoverUnchangedFile(
  upsertedFileAsset: FileAssetRecord,
  recoveryContext: ScanRecoveryContext,
  logger: IngestLogger,
  enqueueJob: <TName extends LibraryJobName>(jobName: TName, payload: LibraryJobPayload<TName>) => Promise<string | undefined>,
  enqueuedRecoveryJobs: string[],
): Promise<void> {
  const recoveryFormatFamily = deriveFormatFamily(upsertedFileAsset.mediaKind);
  if (recoveryFormatFamily !== null && upsertedFileAsset.fullHash !== null) {
    const editionFileLink = recoveryContext.editionFileByFileAssetId.get(upsertedFileAsset.id) ?? null;

    if (editionFileLink !== null) {
      const edition = recoveryContext.editionById.get(editionFileLink.editionId) ?? null;
      if (edition) {
        const work = recoveryContext.workById.get(edition.workId) ?? null;
        if (work && work.enrichmentStatus === "STUB") {
          if (
            upsertedFileAsset.mediaKind === MediaKind.PDF ||
            upsertedFileAsset.mediaKind === MediaKind.CBZ
          ) {
            const directory = path.dirname(upsertedFileAsset.absolutePath);
            const sidecarSiblings = (recoveryContext.fileAssetsByDirectory.get(directory) as FileAssetRecord[]).filter(
              (fileAsset) => fileAsset.mediaKind === MediaKind.SIDECAR,
            );
            const opfSibling = sidecarSiblings.find(
              (fileAsset) => getFileExtension(fileAsset.absolutePath) === "opf",
            );
            if (opfSibling && opfSibling.fullHash !== null) {
              logger.info({ fileAssetId: upsertedFileAsset.id, opfFileAssetId: opfSibling.id, workId: work.id, reason: "STUB work with OPF sibling" }, "Recovery: re-enqueueing OPF PARSE");
              await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
                fileAssetId: opfSibling.id,
              });
              enqueuedRecoveryJobs.push(upsertedFileAsset.id);
            } else {
              logger.info({ fileAssetId: upsertedFileAsset.id, workId: work.id, reason: "work stuck at STUB (no OPF)" }, "Recovery: re-enqueueing MATCH");
              await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
                fileAssetId: upsertedFileAsset.id,
              });
              enqueuedRecoveryJobs.push(upsertedFileAsset.id);
            }
          } else {
            logger.info({ fileAssetId: upsertedFileAsset.id, workId: work.id, reason: "work stuck at STUB" }, "Recovery: re-enqueueing MATCH");
            await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
              fileAssetId: upsertedFileAsset.id,
            });
            enqueuedRecoveryJobs.push(upsertedFileAsset.id);
          }
        }
        if (work && work.coverPath === null) {
          logger.info({ fileAssetId: upsertedFileAsset.id, workId: work.id, reason: "missing cover" }, "Recovery: re-enqueueing PROCESS_COVER");
          await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
            workId: work.id,
            fileAssetId: upsertedFileAsset.id,
          });
          addRecoveryJobIdOnce(enqueuedRecoveryJobs, upsertedFileAsset.id);
        }
      }

      const editionLinkedMeta = parseStoredMetadata(upsertedFileAsset.metadata);
      if (
        upsertedFileAsset.mediaKind === MediaKind.AUDIO &&
        editionLinkedMeta?.status === "unparseable"
      ) {
        logger.info({ fileAssetId: upsertedFileAsset.id, reason: "edition-linked audio with unparseable metadata" }, "Recovery: re-enqueueing PARSE");
        await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
          fileAssetId: upsertedFileAsset.id,
        });
        addRecoveryJobIdOnce(enqueuedRecoveryJobs, upsertedFileAsset.id);
      }

      if (
        upsertedFileAsset.mediaKind === MediaKind.AUDIO &&
        edition &&
        edition.formatFamily === FormatFamily.AUDIOBOOK
      ) {
        await enqueueJob(LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS, {
          fileAssetId: upsertedFileAsset.id,
        });
        addRecoveryJobIdOnce(enqueuedRecoveryJobs, upsertedFileAsset.id);
      }
    } else {
      const parsedMeta = parseStoredMetadata(upsertedFileAsset.metadata);

      if (!parsedMeta || parsedMeta.status !== "parsed") {
        if (
          upsertedFileAsset.mediaKind === MediaKind.EPUB ||
          usesPathDerivedEbookMetadata(upsertedFileAsset.mediaKind) ||
          upsertedFileAsset.mediaKind === MediaKind.AUDIO
        ) {
          logger.info({ fileAssetId: upsertedFileAsset.id, reason: "missing or failed metadata" }, "Recovery: re-enqueueing PARSE");
          await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
            fileAssetId: upsertedFileAsset.id,
          });
          enqueuedRecoveryJobs.push(upsertedFileAsset.id);
        }
      } else {
        logger.info({ fileAssetId: upsertedFileAsset.id, reason: "parsed but unmatched" }, "Recovery: re-enqueueing MATCH");
        await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
          fileAssetId: upsertedFileAsset.id,
        });
        enqueuedRecoveryJobs.push(upsertedFileAsset.id);
      }
    }
  }

  const isOpfSidecar = upsertedFileAsset.mediaKind === MediaKind.SIDECAR
    && getFileExtension(upsertedFileAsset.absolutePath) === "opf";
  if (isOpfSidecar && upsertedFileAsset.fullHash !== null) {
    const opfMeta = parseStoredMetadata(upsertedFileAsset.metadata);
    if (!opfMeta || opfMeta.status !== "parsed") {
      logger.info({ fileAssetId: upsertedFileAsset.id, reason: "OPF hashed but not parsed" }, "Recovery: re-enqueueing OPF PARSE");
      await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
        fileAssetId: upsertedFileAsset.id,
      });
      enqueuedRecoveryJobs.push(upsertedFileAsset.id);
    }
  }
}

const SIMILARITY_THRESHOLD = 0.85;

async function duplicatePairExists(
  dupDb: IngestDb["duplicateCandidate"],
  left: { editionId?: string; fileAssetId?: string },
  right: { editionId?: string; fileAssetId?: string },
): Promise<boolean> {
  const existing = await dupDb.findFirst({
    where: {
      OR: [
        {
          leftEditionId: left.editionId,
          rightEditionId: right.editionId,
          leftFileAssetId: left.fileAssetId,
          rightFileAssetId: right.fileAssetId,
        },
        {
          leftEditionId: right.editionId,
          rightEditionId: left.editionId,
          leftFileAssetId: right.fileAssetId,
          rightFileAssetId: left.fileAssetId,
        },
      ],
    },
  });
  return existing !== null;
}

const DUPLICATE_MEDIA_KINDS: ReadonlySet<MediaKind> = new Set([
  MediaKind.EPUB,
  MediaKind.KEPUB,
  MediaKind.MOBI,
  MediaKind.AZW,
  MediaKind.AZW3,
  MediaKind.PDF,
  MediaKind.CBZ,
]);

async function detectDuplicatesImpl(
  input: DetectDuplicatesInput,
  ingestDb: IngestDb,
): Promise<DetectDuplicatesResult> {
  const fileAsset = await ingestDb.fileAsset.findUnique({ where: { id: input.fileAssetId } });

  if (fileAsset === null) {
    return { fileAssetId: input.fileAssetId, skipped: true, candidatesCreated: 0 };
  }

  const editionFile = await ingestDb.editionFile.findFirst({
    where: { fileAssetId: fileAsset.id },
  });

  if (editionFile === null) {
    return { fileAssetId: input.fileAssetId, skipped: true, candidatesCreated: 0 };
  }

  const edition = await ingestDb.edition.findUnique({ where: { id: editionFile.editionId } });
  if (edition === null) {
    return { fileAssetId: input.fileAssetId, skipped: true, candidatesCreated: 0 };
  }

  if (!DUPLICATE_MEDIA_KINDS.has(fileAsset.mediaKind)) {
    return { fileAssetId: input.fileAssetId, skipped: true, candidatesCreated: 0 };
  }

  const work = await ingestDb.work.findUnique({ where: { id: edition.workId } });

  let candidatesCreated = 0;

  // Strategy A: SAME_HASH
  if (fileAsset.fullHash) {
    const hashMatches = await ingestDb.fileAsset.findMany({
      where: { fullHash: fileAsset.fullHash, NOT: { id: fileAsset.id } },
    });
    for (const match of hashMatches) {
      const matchEditionFile = await ingestDb.editionFile.findFirst({
        where: { fileAssetId: match.id },
      });
      if (matchEditionFile?.editionId === edition.id) {
        continue;
      }

      const alreadyExists = await duplicatePairExists(
        ingestDb.duplicateCandidate,
        { fileAssetId: fileAsset.id },
        { fileAssetId: match.id },
      );
      if (!alreadyExists) {
        await ingestDb.duplicateCandidate.create({
          data: {
            leftFileAssetId: fileAsset.id,
            rightFileAssetId: match.id,
            reason: "SAME_HASH",
            confidence: 1.0,
          },
        });
        candidatesCreated += 1;
      }
    }
  }

  // Strategy B: SAME_ISBN
  const isbnClauses: Array<Partial<Pick<EditionRecord, "isbn13" | "isbn10">>> = [];
  if (edition.isbn13) isbnClauses.push({ isbn13: edition.isbn13 });
  if (edition.isbn10) isbnClauses.push({ isbn10: edition.isbn10 });

  if (isbnClauses.length > 0) {
    const isbnMatches = await ingestDb.edition.findMany({
      where: { OR: isbnClauses, NOT: { id: edition.id }, formatFamily: edition.formatFamily },
    });
    for (const match of isbnMatches) {
      // Skip ISBN collisions: different books sharing an ISBN (e.g. omnibus editions)
      if (work && match.workId !== edition.workId) {
        const matchWork = await ingestDb.work.findUnique({ where: { id: match.workId } });
        if (matchWork && matchWork.titleCanonical !== work.titleCanonical) {
          continue;
        }
      }

      // Skip different file types (e.g. EPUB vs PDF of same book)
      const matchEditionFiles = await ingestDb.editionFile.findMany({ where: { editionId: match.id } });
      if (matchEditionFiles.length > 0) {
        const matchFileAssets = await Promise.all(
          matchEditionFiles.map((ef) => ingestDb.fileAsset.findUnique({ where: { id: ef.fileAssetId } })),
        );
        const matchMediaKinds = new Set(
          matchFileAssets.filter((fa): fa is FileAssetRecord => fa !== null).map((fa) => fa.mediaKind),
        );
        if (matchMediaKinds.size > 0 && !matchMediaKinds.has(fileAsset.mediaKind)) {
          continue;
        }
      }

      const alreadyExists = await duplicatePairExists(
        ingestDb.duplicateCandidate,
        { editionId: edition.id },
        { editionId: match.id },
      );
      if (!alreadyExists) {
        await ingestDb.duplicateCandidate.create({
          data: {
            leftEditionId: edition.id,
            rightEditionId: match.id,
            reason: "SAME_ISBN",
            confidence: 1.0,
          },
        });
        candidatesCreated += 1;
      }
    }
  }

  // Strategy C: SIMILAR_TITLE_AUTHOR
  if (work && work.titleCanonical) {
    const myWorkMatches = await ingestDb.work.findMany({
      where: { titleCanonical: work.titleCanonical },
      include: { editions: { include: { contributors: { include: { contributor: true } } } } },
    });
    // The work is guaranteed to be in the results since we queried by its own titleCanonical
    const myWork = myWorkMatches.find((w) => w.id === work.id) as typeof myWorkMatches[number];
    const myAuthors = getAuthorCanonicalsForWork(myWork);

    const otherWorks = await ingestDb.work.findMany({
      where: { NOT: { id: work.id } },
      include: { editions: { include: { contributors: { include: { contributor: true } } } } },
    });

    for (const otherWork of otherWorks) {
      if (!otherWork.titleCanonical) continue;

      const otherEdition = otherWork.editions[0];
      if (!otherEdition) continue;

      // Skip different file types (e.g. EPUB vs PDF of same book)
      const otherEditionFiles = await ingestDb.editionFile.findMany({ where: { editionId: otherEdition.id } });
      if (otherEditionFiles.length > 0) {
        const otherFileAssets = await Promise.all(
          otherEditionFiles.map((ef) => ingestDb.fileAsset.findUnique({ where: { id: ef.fileAssetId } })),
        );
        const otherMediaKinds = new Set(
          otherFileAssets.filter((fa): fa is FileAssetRecord => fa !== null).map((fa) => fa.mediaKind),
        );
        if (otherMediaKinds.size > 0 && !otherMediaKinds.has(fileAsset.mediaKind)) {
          continue;
        }
      }

      const titleSim = normalizedSimilarity(work.titleCanonical, otherWork.titleCanonical);
      if (titleSim < SIMILARITY_THRESHOLD) continue;

      const otherAuthors = getAuthorCanonicalsForWork(otherWork);
      if (myAuthors.length === 0 && otherAuthors.length === 0) continue;

      const authorSim = computeAuthorSimilarity(myAuthors, otherAuthors);
      if (authorSim < SIMILARITY_THRESHOLD) continue;

      const confidence = Math.min(titleSim, authorSim);

      const alreadyExists = await duplicatePairExists(
        ingestDb.duplicateCandidate,
        { editionId: edition.id },
        { editionId: otherEdition.id },
      );
      if (!alreadyExists) {
        await ingestDb.duplicateCandidate.create({
          data: {
            leftEditionId: edition.id,
            rightEditionId: otherEdition.id,
            reason: "SIMILAR_TITLE_AUTHOR",
            confidence,
          },
        });
        candidatesCreated += 1;
      }
    }
  }

  return { fileAssetId: input.fileAssetId, skipped: false, candidatesCreated };
}

async function matchSuggestionPairExists(
  alDb: IngestDb["matchSuggestion"],
  targetWorkId: string,
  suggestedWorkId: string,
): Promise<boolean> {
  const existing = await alDb.findFirst({
    where: { targetWorkId, suggestedWorkId },
  });
  return existing !== null;
}

const SUBTITLE_CONFIDENCE_PENALTY = 0.9;

const MERGE_METADATA_FIELDS = ["description", "coverPath", "seriesId", "seriesPosition", "sortTitle"] as const;

interface TitleMatchResult {
  similarity: number;
  matchType: string;
}

function computeTitleMatch(
  canonicalA: string,
  canonicalB: string,
  displayA: string,
  displayB: string,
  hasAuthors: boolean,
): TitleMatchResult | null {
  // Pass 1: canonical similarity (existing behavior)
  const canonicalSim = normalizedSimilarity(canonicalA, canonicalB);
  if (hasAuthors) {
    if (canonicalSim >= SIMILARITY_THRESHOLD) {
      return { similarity: canonicalSim, matchType: "SAME_WORK" };
    }
  } else {
    // Title-only: require exact canonical match
    if (canonicalA === canonicalB) {
      return { similarity: canonicalSim, matchType: "TITLE_ONLY" };
    }
  }

  // Pass 2: normalized title matching (strip parentheticals, "A Novel", etc.)
  const normA = normalizeForTitleMatching(displayA);
  const normB = normalizeForTitleMatching(displayB);
  if (normA && normB) {
    if (hasAuthors) {
      const normSim = normalizedSimilarity(normA, normB);
      if (normSim >= SIMILARITY_THRESHOLD) {
        return { similarity: normSim, matchType: "NORMALIZED_TITLE" };
      }
    } else {
      // Title-only: require exact normalized equality
      if (normA === normB) {
        return { similarity: 1.0, matchType: "TITLE_ONLY" };
      }
    }
  }

  // Pass 3: subtitle stripping
  const strippedA = stripSubtitleForMatching(displayA);
  const strippedB = stripSubtitleForMatching(displayB);
  // At least one side must have a subtitle to strip, otherwise this is the same as pass 1
  if (strippedA && strippedB) {
    if (hasAuthors) {
      const strippedSim = normalizedSimilarity(strippedA, strippedB);
      if (strippedSim >= SIMILARITY_THRESHOLD) {
        return { similarity: strippedSim * SUBTITLE_CONFIDENCE_PENALTY, matchType: "SUBTITLE_STRIPPED" };
      }
    } else {
      if (strippedA === strippedB) {
        return { similarity: SUBTITLE_CONFIDENCE_PENALTY, matchType: "TITLE_ONLY" };
      }
    }
  }
  // Also try: one side stripped, other side canonical (common case: audiobook has no subtitle, ebook has one)
  if (strippedA || strippedB) {
    const effectiveA = strippedA ?? canonicalA;
    const effectiveB = strippedB ?? canonicalB;
    if (hasAuthors) {
      const mixedSim = normalizedSimilarity(effectiveA, effectiveB);
      if (mixedSim >= SIMILARITY_THRESHOLD) {
        return { similarity: mixedSim * SUBTITLE_CONFIDENCE_PENALTY, matchType: "SUBTITLE_STRIPPED" };
      }
    } else {
      if (effectiveA === effectiveB) {
        return { similarity: SUBTITLE_CONFIDENCE_PENALTY, matchType: "TITLE_ONLY" };
      }
    }
  }

  return null;
}

async function mergeWorks(
  ingestDb: IngestDb,
  survivingWork: WorkRecord,
  losingWork: WorkRecord,
): Promise<void> {
  // Reconcile metadata: fill nulls on surviving work from losing work
  const updates: Partial<Pick<WorkRecord, typeof MERGE_METADATA_FIELDS[number]>> = {};
  let hasUpdates = false;
  for (const field of MERGE_METADATA_FIELDS) {
    if (survivingWork[field] === null && losingWork[field] !== null) {
      (updates as Record<string, string | number | null | undefined>)[field] = losingWork[field];
      hasUpdates = true;
    }
  }
  if (hasUpdates) {
    await ingestDb.work.update({ where: { id: survivingWork.id }, data: updates });
  }

  // Move all editions from losing work to surviving work
  await ingestDb.edition.updateMany({ where: { workId: losingWork.id }, data: { workId: survivingWork.id } });

  // Delete losing work (cascades CollectionItems, WorkProgressPreferences)
  await ingestDb.work.delete({ where: { id: losingWork.id } });
}

async function matchSuggestionsImpl(
  input: MatchSuggestionsInput,
  ingestDb: IngestDb,
): Promise<MatchSuggestionsResult> {
  const fileAsset = await ingestDb.fileAsset.findUnique({ where: { id: input.fileAssetId } });
  if (fileAsset === null) {
    return { fileAssetId: input.fileAssetId, skipped: true, linksCreated: 0 };
  }

  const editionFile = await ingestDb.editionFile.findFirst({
    where: { fileAssetId: fileAsset.id },
  });
  if (editionFile === null) {
    return { fileAssetId: input.fileAssetId, skipped: true, linksCreated: 0 };
  }

  const edition = await ingestDb.edition.findUnique({ where: { id: editionFile.editionId } });
  if (edition === null) {
    return { fileAssetId: input.fileAssetId, skipped: true, linksCreated: 0 };
  }

  const work = await ingestDb.work.findUnique({ where: { id: edition.workId } });
  if (!work || !work.titleCanonical) {
    return { fileAssetId: input.fileAssetId, skipped: true, linksCreated: 0 };
  }

  const isAudiobook = edition.formatFamily === "AUDIOBOOK";
  const isEbook = edition.formatFamily === "EBOOK";
  if (!isAudiobook && !isEbook) {
    return { fileAssetId: input.fileAssetId, skipped: true, linksCreated: 0 };
  }

  let linksCreated = 0;

  // Query all works to find cross-work matches
  const allWorks = await ingestDb.work.findMany({
    where: { NOT: { id: work.id } },
    include: { editions: { include: { contributors: { include: { contributor: true } } } } },
  });

  // Get author info for current work
  const myWorkWithEditions = await ingestDb.work.findMany({
    where: { titleCanonical: work.titleCanonical },
    include: { editions: { include: { contributors: { include: { contributor: true } } } } },
  });
  const myWork = myWorkWithEditions.find((w) => w.id === work.id) as typeof myWorkWithEditions[number];
  const myAuthors = getAuthorCanonicalsForWork(myWork);

  for (const otherWork of allWorks) {
    if (!otherWork.titleCanonical) continue;

    // Only match if the other work has editions in the opposite format
    const targetFormat = isAudiobook ? "EBOOK" : "AUDIOBOOK";
    const hasOppositeFormat = otherWork.editions.some((e) => e.formatFamily === targetFormat);
    if (!hasOppositeFormat) continue;

    const otherAuthors = getAuthorCanonicalsForWork(otherWork);
    const hasAuthors = myAuthors.length > 0 && otherAuthors.length > 0;

    const titleMatch = computeTitleMatch(
      work.titleCanonical,
      otherWork.titleCanonical,
      work.titleDisplay,
      otherWork.titleDisplay,
      hasAuthors,
    );
    if (!titleMatch) continue;

    let matchConfidence: number;
    let matchType: string;

    if (!hasAuthors) {
      matchConfidence = titleMatch.similarity;
      matchType = titleMatch.matchType;
    } else {
      const authorSim = computeAuthorSimilarity(myAuthors, otherAuthors);
      if (authorSim < SIMILARITY_THRESHOLD) continue;
      matchConfidence = Math.min(titleMatch.similarity, authorSim);
      matchType = titleMatch.matchType;
    }

    // Determine work roles: ebook work and audiobook work
    const targetWorkId = isAudiobook ? otherWork.id : work.id;
    const suggestedWorkId = isAudiobook ? work.id : otherWork.id;

    // Skip if a link already exists for this work pair (any status — respect IGNORED)
    const alreadyExists = await matchSuggestionPairExists(ingestDb.matchSuggestion, targetWorkId, suggestedWorkId);
    if (alreadyExists) continue;

    // Create PENDING suggestion — works are NOT merged here; merge happens on user confirm
    await ingestDb.matchSuggestion.create({
      data: {
        targetWorkId,
        suggestedWorkId,
        matchType,
        confidence: matchConfidence,
      },
    });
    linksCreated += 1;
  }

  return { fileAssetId: input.fileAssetId, skipped: false, linksCreated };
}

export function createIngestServices(
  dependencies: Partial<IngestDependencies> = {},
) {
  const ingestDb = dependencies.db ?? createDefaultIngestDb();
  const listDirectory = dependencies.listDirectory ?? readdir;
  const readStats = dependencies.readStats ?? lstat;
  const hashFile = dependencies.hashFile ?? hashFileContents;
  const parseEpub = dependencies.parseEpub ?? parseEpubMetadata;
  const parseOpf = dependencies.parseOpf ?? parseOpfSidecar;
  const parseAudioJson = dependencies.parseAudiobookJson ?? parseAudiobookMetadataJson;
  const parseAudioId3 = dependencies.parseAudioId3 ?? parseAudioId3Tags;
  const enqueueJob = dependencies.enqueueLibraryJob ?? enqueueLibraryJob;
  const logger = dependencies.logger ?? createLogger("ingest");

  async function scanLibraryRoot(input: ScanLibraryRootInput): Promise<ScanLibraryRootResult> {
    const now = input.now ?? new Date();
    const reportProgress = input.reportProgress;
    const libraryRoot = await getExistingLibraryRootOrThrow(ingestDb, input.libraryRootId);
    const effectiveScanMode = input.scanMode ?? libraryRoot.scanMode;
    const normalizedRootPath = normalizeRootPath(libraryRoot.path);
    const existingFileAssets = await ingestDb.fileAsset.findMany({
      where: { libraryRootId: libraryRoot.id },
    });
    const existingByPath = new Map(
      existingFileAssets.map((fileAsset) => [fileAsset.absolutePath, fileAsset]),
    );
    const fileAssetsByDirectory = buildFileAssetsByDirectory(existingFileAssets);
    const existingEditionFiles = existingFileAssets.length === 0
      ? []
      : await ingestDb.editionFile.findMany({
        where: {
          fileAssetId: { in: existingFileAssets.map((fileAsset) => fileAsset.id) },
        },
      });
    const editionFileByFileAssetId = new Map<string, EditionFileRecord>();
    for (const editionFile of [...existingEditionFiles].reverse()) {
      editionFileByFileAssetId.set(editionFile.fileAssetId, editionFile);
    }
    const existingEditions = existingEditionFiles.length === 0
      ? []
      : await ingestDb.edition.findManyByIds({
        ids: [...new Set(existingEditionFiles.map((editionFile) => editionFile.editionId))],
      });
    const editionById = new Map(
      existingEditions.map((edition) => [edition.id, edition]),
    );
    const existingWorks = existingEditions.length === 0
      ? []
      : await ingestDb.work.findManyByIds({
        ids: [...new Set(existingEditions.map((edition) => edition.workId))],
      });
    const workById = new Map(
      existingWorks.map((work) => [work.id, work]),
    );
    const discoveredPaths = await walkRegularFiles(normalizedRootPath, listDirectory, readStats, logger);
    const scanPathStats = await collectScanPathStats(discoveredPaths, readStats, logger);
    const seenPaths = new Set<string>();
    const scannedFileAssetIds: string[] = [];
    const enqueuedHashJobs: string[] = [];
    const enqueuedRecoveryJobs: string[] = [];
    const createdStubWorkIds: string[] = [];
    const seenAudioDirs = new Map<string, { workId: string; editionId: string }>();
    const seenEbookVariantTitles = new Map<string, { workId: string; editionId: string }>();
    const unchangedSeenFileAssetIds: string[] = [];

    if (reportProgress) {
      await reportProgress({ totalFiles: discoveredPaths.length, scanStage: "DISCOVERY" });
    }

    let processedFiles = 0;
    let errorCount = 0;

    for (const pathStats of scanPathStats) {
      if (pathStats.statFailed || pathStats.fileStats === undefined) {
        processedFiles++;
        errorCount++;
        if (reportProgress && processedFiles % SCAN_PROGRESS_INTERVAL === 0) {
          await reportProgress({ processedFiles, errorCount });
        }
        continue;
      }

      const { absolutePath, fileStats } = pathStats;
      if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
        processedFiles++;
        if (reportProgress && processedFiles % SCAN_PROGRESS_INTERVAL === 0) {
          await reportProgress({ processedFiles, errorCount });
        }
        continue;
      }

      const relativePath = normalizeRelativePath(normalizedRootPath, absolutePath);
      const existingFileAsset = existingByPath.get(absolutePath);
      const nextFileState = {
        mtime: fileStats.mtime,
        sizeBytes: BigInt(fileStats.size),
      };
      const fileChanged = isFileChanged(existingFileAsset, nextFileState);
      const fileStatsChanged = didFileStatsChange(existingFileAsset, nextFileState);
      const hasExistingEditionLink = existingFileAsset !== undefined
        && editionFileByFileAssetId.has(existingFileAsset.id);
      const shouldReuseUnchangedLinkedFile = effectiveScanMode === ScanMode.FULL
        && !fileChanged
        && existingFileAsset?.fullHash !== null
        && hasExistingEditionLink;
      const shouldEnqueueHash = !shouldReuseUnchangedLinkedFile
        && (effectiveScanMode === ScanMode.FULL || fileChanged);
      const shouldUpsert = effectiveScanMode === ScanMode.FULL
        || existingFileAsset === undefined
        || existingFileAsset.availabilityStatus === AvailabilityStatus.MISSING
        || fileStatsChanged;
      let upsertedFileAsset: FileAssetRecord;
      if (shouldUpsert) {
        upsertedFileAsset = await ingestDb.fileAsset.upsert({
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
      } else {
        upsertedFileAsset = existingFileAsset;
      }

      seenPaths.add(absolutePath);
      scannedFileAssetIds.push(upsertedFileAsset.id);
      if (shouldUpsert) {
        existingByPath.set(absolutePath, upsertedFileAsset);
        setDirectoryFileAsset(fileAssetsByDirectory, upsertedFileAsset);
      } else {
        unchangedSeenFileAssetIds.push(upsertedFileAsset.id);
      }

      if (shouldEnqueueHash) {
        await enqueueJob(LIBRARY_JOB_NAMES.HASH_FILE_ASSET, {
          fileAssetId: upsertedFileAsset.id,
        });
        enqueuedHashJobs.push(upsertedFileAsset.id);
      } else {
        await recoverUnchangedFile(
          upsertedFileAsset,
          {
            editionById,
            editionFileByFileAssetId,
            fileAssetsByDirectory,
            workById,
          },
          logger,
          enqueueJob,
          enqueuedRecoveryJobs,
        );
      }

      // Create stub Work/Edition/EditionFile for new files with a content format
      if (!existingFileAsset) {
        const formatFamily = deriveFormatFamily(upsertedFileAsset.mediaKind);
        if (formatFamily !== null) {
          const existingLink = await ingestDb.editionFile.findFirst({
            where: { fileAssetId: upsertedFileAsset.id },
          });

          if (existingLink === null) {
            if (upsertedFileAsset.mediaKind === MediaKind.AUDIO) {
              const audioDir = path.dirname(relativePath);
              const existing = seenAudioDirs.get(audioDir);
              if (existing) {
                // Add track to existing audiobook edition
                await ingestDb.editionFile.create({
                  data: {
                    editionId: existing.editionId,
                    fileAssetId: upsertedFileAsset.id,
                    role: EditionFileRole.AUDIO_TRACK,
                  },
                });
              } else {
                // New audiobook directory — create stub
                const { title, titleCanonical } = deriveTitleFromPath(relativePath, upsertedFileAsset.mediaKind);
                const stubWork = await ingestDb.work.create({
                  data: {
                    enrichmentStatus: "STUB",
                    sortTitle: null,
                    titleCanonical,
                    titleDisplay: title,
                  },
                });
                const stubEdition = await ingestDb.edition.create({
                  data: {
                    asin: null,
                    formatFamily,
                    isbn10: null,
                    isbn13: null,
                    language: null,
                    publishedAt: null,
                    publisher: null,
                    workId: stubWork.id,
                  },
                });
                await ingestDb.editionFile.create({
                  data: {
                    editionId: stubEdition.id,
                    fileAssetId: upsertedFileAsset.id,
                    role: EditionFileRole.AUDIO_TRACK,
                  },
                });
                seenAudioDirs.set(audioDir, { workId: stubWork.id, editionId: stubEdition.id });
                createdStubWorkIds.push(stubWork.id);
                await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
                  workId: stubWork.id,
                  fileAssetId: upsertedFileAsset.id,
                });
              }
            } else {
              const ebookVariantMetadata = usesPathDerivedEbookMetadata(upsertedFileAsset.mediaKind)
                ? deriveEbookVariantMetadataFromPath(relativePath)
                : null;
              const title = ebookVariantMetadata?.title
                ?? deriveTitleFromPath(relativePath, upsertedFileAsset.mediaKind).title;
              const titleCanonical = canonicalizeBookTitle(title) ?? title.toLowerCase();

              const existingEbookVariant = groupsWithSiblingEbookVariants(upsertedFileAsset.mediaKind)
                ? seenEbookVariantTitles.get(titleCanonical)
                : undefined;

              if (existingEbookVariant) {
                await ingestDb.editionFile.create({
                  data: {
                    editionId: existingEbookVariant.editionId,
                    fileAssetId: upsertedFileAsset.id,
                    role: EditionFileRole.ALTERNATE_FORMAT,
                  },
                });
              } else {
                // Ebook file — create stub per file
                const stubWork = await ingestDb.work.create({
                  data: {
                    enrichmentStatus: "STUB",
                    sortTitle: null,
                    titleCanonical,
                    titleDisplay: title,
                  },
                });
                const stubEdition = await ingestDb.edition.create({
                  data: {
                    asin: null,
                    formatFamily,
                    isbn10: null,
                    isbn13: null,
                    language: null,
                    publishedAt: null,
                    publisher: null,
                    workId: stubWork.id,
                  },
                });
                await ingestDb.editionFile.create({
                  data: {
                    editionId: stubEdition.id,
                    fileAssetId: upsertedFileAsset.id,
                    role: EditionFileRole.PRIMARY,
                  },
                });
                if (groupsWithSiblingEbookVariants(upsertedFileAsset.mediaKind)) {
                  seenEbookVariantTitles.set(titleCanonical, { workId: stubWork.id, editionId: stubEdition.id });
                }
                createdStubWorkIds.push(stubWork.id);
                await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
                  workId: stubWork.id,
                  fileAssetId: upsertedFileAsset.id,
                });
              }
            }
          }
        }
      }

      processedFiles++;
      if (reportProgress && processedFiles % SCAN_PROGRESS_INTERVAL === 0) {
        await reportProgress({ processedFiles, errorCount });
      }
    }


    if (reportProgress) {
      await reportProgress({
        processedFiles,
        errorCount,
        scanStage: "PROCESSING",
      });
    }

    const missingFileAssetIds: string[] = [];
    for (const existingFileAsset of existingFileAssets) {
      if (!seenPaths.has(existingFileAsset.absolutePath)) {
        missingFileAssetIds.push(existingFileAsset.id);
      }
    }

    if (unchangedSeenFileAssetIds.length > 0) {
      await ingestDb.fileAsset.updateMany({
        where: { id: { in: unchangedSeenFileAssetIds } },
        data: { lastSeenAt: now },
      });
    }

    if (missingFileAssetIds.length > 0) {
      await ingestDb.fileAsset.updateMany({
        where: { id: { in: missingFileAssetIds } },
        data: {
          availabilityStatus: AvailabilityStatus.MISSING,
        },
      });
    }

    await ingestDb.libraryRoot.update({
      where: { id: libraryRoot.id },
      data: { lastScannedAt: now, scanMode: ScanMode.INCREMENTAL },
    });

    return {
      createdStubWorkIds,
      discoveredPaths,
      enqueuedHashJobs,
      enqueuedRecoveryJobs,
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

      // Move detection: check if a MISSING file has the same hash
      const currentEditionFile = await ingestDb.editionFile.findFirst({
        where: { fileAssetId: fileAsset.id },
      });
      if (currentEditionFile !== null) {
        const currentEdition = await ingestDb.edition.findUnique({
          where: { id: currentEditionFile.editionId },
        });
        if (currentEdition !== null) {
          const currentWork = await ingestDb.work.findUnique({
            where: { id: currentEdition.workId },
          });
          if (currentWork !== null) {
            const hashMatches = await ingestDb.fileAsset.findMany({
              where: { fullHash: hashes.fullHash, NOT: { id: fileAsset.id } },
            });
            const missingMatch = hashMatches.find(
              (fa) => fa.availabilityStatus === AvailabilityStatus.MISSING,
            );
            if (missingMatch) {
              const missingEditionFiles = await ingestDb.editionFile.findMany({
                where: { fileAssetId: missingMatch.id },
              });
              if (missingEditionFiles.length > 0) {
                for (const ef of missingEditionFiles) {
                  await ingestDb.editionFile.update({
                    where: { id: ef.id },
                    data: { fileAssetId: fileAsset.id },
                  });
                }
                await ingestDb.work.delete({ where: { id: currentWork.id } });
                logger.info(
                  { fromFileAssetId: missingMatch.id, toFileAssetId: fileAsset.id },
                  "Move detected: transferred edition links",
                );
                return {
                  availabilityStatus: AvailabilityStatus.PRESENT,
                  fileAssetId: fileAsset.id,
                  fullHash: hashes.fullHash,
                  movedFromFileAssetId: missingMatch.id,
                  partialHash: hashes.partialHash,
                };
              }
            }
          }
        }
      }

      if (
        fileAsset.mediaKind === MediaKind.EPUB ||
        isEbookVariant(fileAsset.mediaKind) ||
        (fileAsset.mediaKind === MediaKind.SIDECAR && getFileExtension(fileAsset.absolutePath) === "opf") ||
        fileAsset.mediaKind === MediaKind.AUDIO ||
        (fileAsset.mediaKind === MediaKind.SIDECAR &&
          path.basename(fileAsset.absolutePath).toLowerCase() === "metadata.json")
      ) {
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
      const errorCode = getErrorCode(error as NodeError);

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

      if (errorCode === "EPERM" || errorCode === "EACCES") {
        logger.warn(
          { fileAssetId: fileAsset.id, path: fileAsset.absolutePath, errorCode },
          "Permission denied reading file, marking as inaccessible",
        );
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

    const isOpfSidecar = fileAsset.mediaKind === MediaKind.SIDECAR && getFileExtension(fileAsset.absolutePath) === "opf";

    if (isOpfSidecar) {
      try {
        const raw = await parseOpf(fileAsset.absolutePath);
        const normalized = normalizeOpfMetadata(raw);
        const metadata: ParsedFileAssetMetadata = {
          normalized,
          parsedAt: now.toISOString(),
          parserVersion: OPF_PARSER_VERSION,
          raw,
          source: "opf-sidecar",
          status: "parsed",
          warnings: [],
        };

        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.PRESENT,
            lastSeenAt: now,
            metadata: metadata as object as FileAsset["metadata"],
          },
        });

        // Folder-proximity enrichment: find sibling book files
        const directory = path.dirname(fileAsset.absolutePath);
        const siblings = await ingestDb.fileAsset.findByDirectory({
          directoryPath: directory,
          mediaKinds: [MediaKind.EPUB, MediaKind.PDF, MediaKind.CBZ, MediaKind.AUDIO],
        });

        for (const sibling of siblings) {
          const editionFile = await ingestDb.editionFile.findFirst({
            where: { fileAssetId: sibling.id },
          });

          if (!editionFile) continue;

          const edition = await ingestDb.edition.findUnique({
            where: { id: editionFile.editionId },
          });

          if (!edition) continue;

          // Update edition fields (only if null — supplement, not override)
          const editionUpdates: Partial<Pick<EditionRecord, "publisher" | "publishedAt" | "isbn13" | "isbn10" | "asin">> = {};
          if (!edition.publisher && normalized.publisher) editionUpdates.publisher = normalized.publisher;
          if (!edition.publishedAt && normalized.date) {
            const parsedDate = new Date(normalized.date);
            if (!isNaN(parsedDate.getTime())) editionUpdates.publishedAt = parsedDate;
          }
          if (!edition.isbn13 && normalized.identifiers.isbn13) editionUpdates.isbn13 = normalized.identifiers.isbn13;
          if (!edition.isbn10 && normalized.identifiers.isbn10) editionUpdates.isbn10 = normalized.identifiers.isbn10;
          if (!edition.asin && normalized.identifiers.asin) editionUpdates.asin = normalized.identifiers.asin;

          if (Object.keys(editionUpdates).length > 0) {
            await ingestDb.edition.update({
              where: { id: edition.id },
              data: editionUpdates,
            });
          }

          // Update work fields
          const work = await ingestDb.work.findUnique({
            where: { id: edition.workId },
          });

          if (!work) continue;

          const workUpdates: Partial<Pick<WorkRecord, "description" | "seriesId" | "seriesPosition" | "titleDisplay" | "titleCanonical" | "enrichmentStatus">> = {};
          if (!work.description && normalized.description) workUpdates.description = normalized.description;

          if (!edition.language && normalized.language) {
            await ingestDb.edition.update({
              where: { id: edition.id },
              data: { language: normalized.language },
            });
          }

          if (!work.seriesId && normalized.series) {
            const series = await ingestDb.series.upsert({
              name: normalized.series.name,
            });
            workUpdates.seriesId = series.id;
            if (normalized.series.index !== undefined) {
              workUpdates.seriesPosition = normalized.series.index;
            }
          }

          // Transition STUB works to ENRICHED with title from OPF
          if (work.enrichmentStatus === "STUB" && normalized.title) {
            workUpdates.titleDisplay = normalized.title;
            workUpdates.titleCanonical = canonicalizeBookTitle(normalized.title);
            workUpdates.enrichmentStatus = "ENRICHED";
          }

          if (Object.keys(workUpdates).length > 0) {
            await ingestDb.work.update({
              where: { id: work.id },
              data: workUpdates,
            });
          }

          // Add authors from OPF metadata for STUB works being enriched
          if (work.enrichmentStatus === "STUB" && normalized.authors.length > 0) {
            await ensureContributors(ingestDb, editionFile.editionId, normalized.authors, ContributorRole.AUTHOR);
          }

          // Enqueue cover processing for works without covers
          if (work.coverPath === null) {
            await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
              workId: work.id,
              fileAssetId: sibling.id,
            });
          }
        }

        return {
          availabilityStatus: AvailabilityStatus.PRESENT,
          fileAssetId: fileAsset.id,
          metadata,
          skipped: false,
        };
      } catch (error) {
        const errorCode = getErrorCode(error as NodeError);

        if (errorCode === "ENOENT") {
          await ingestDb.fileAsset.update({
            where: { id: fileAsset.id },
            data: {
              availabilityStatus: AvailabilityStatus.MISSING,
              lastSeenAt: now,
            },
          });
          return { availabilityStatus: AvailabilityStatus.MISSING, fileAssetId: fileAsset.id, skipped: false };
        }

        if (isTransientError(error as NodeError)) {
          throw error;
        }

        const warning = error instanceof Error ? error.message : "Unknown OPF parsing error";
        const metadata: ParsedFileAssetMetadata = {
          parsedAt: now.toISOString(),
          parserVersion: OPF_PARSER_VERSION,
          source: "opf-sidecar",
          status: "unparseable",
          warnings: [warning],
        };

        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.PRESENT,
            lastSeenAt: now,
            metadata: metadata as object as FileAsset["metadata"],
          },
        });

        return { availabilityStatus: AvailabilityStatus.PRESENT, fileAssetId: fileAsset.id, metadata, skipped: false };
      }
    }

    // Audiobook metadata.json sidecar
    const isAudiobookJson = fileAsset.mediaKind === MediaKind.SIDECAR &&
      path.basename(fileAsset.absolutePath).toLowerCase() === "metadata.json";

    if (isAudiobookJson) {
      try {
        const jsonRaw = await parseAudioJson(fileAsset.absolutePath);

        // Try to supplement with ID3 tags from first audio sibling
        const directory = path.dirname(fileAsset.absolutePath);
        const audioSiblings = await ingestDb.fileAsset.findByDirectory({
          directoryPath: directory,
          mediaKinds: [MediaKind.AUDIO],
        });

        let id3Raw: ParsedAudioId3TagsRaw | undefined;
        const firstAudioSibling = audioSiblings[0];
        if (firstAudioSibling) {
          try {
            const { tags } = await parseAudioId3(firstAudioSibling.absolutePath);
            id3Raw = tags;
          } catch (error) {
            logger.warn(
              {
                err: error instanceof Error ? error.message : String(error),
                audioPath: firstAudioSibling.absolutePath,
                sidecarPath: fileAsset.absolutePath,
                fileAssetId: fileAsset.id,
              },
              "ID3 parsing failed for audio sibling during sidecar flow",
            );
          }
        }

        const normalized = normalizeAudiobookMetadata(jsonRaw, id3Raw);
        const metadata: ParsedFileAssetMetadata = {
          normalized,
          parsedAt: now.toISOString(),
          parserVersion: AUDIOBOOK_JSON_PARSER_VERSION,
          raw: jsonRaw,
          source: "audiobook-json",
          status: "parsed",
          warnings: [],
        };

        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.PRESENT,
            lastSeenAt: now,
            metadata: metadata as object as FileAsset["metadata"],
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
        const errorCode = getErrorCode(error as NodeError);

        if (errorCode === "ENOENT") {
          await ingestDb.fileAsset.update({
            where: { id: fileAsset.id },
            data: {
              availabilityStatus: AvailabilityStatus.MISSING,
              lastSeenAt: now,
            },
          });
          return { availabilityStatus: AvailabilityStatus.MISSING, fileAssetId: fileAsset.id, skipped: false };
        }

        if (isTransientError(error as NodeError)) {
          throw error;
        }

        const warning = error instanceof Error ? error.message : "Unknown audiobook metadata.json parsing error";
        const metadata: ParsedFileAssetMetadata = {
          parsedAt: now.toISOString(),
          parserVersion: AUDIOBOOK_JSON_PARSER_VERSION,
          source: "audiobook-json",
          status: "unparseable",
          warnings: [warning],
        };

        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.PRESENT,
            lastSeenAt: now,
            metadata: metadata as object as FileAsset["metadata"],
          },
        });

        return { availabilityStatus: AvailabilityStatus.PRESENT, fileAssetId: fileAsset.id, metadata, skipped: false };
      }
    }

    // Standalone audio file (no metadata.json)
    if (fileAsset.mediaKind === MediaKind.AUDIO) {
      // Check if a sibling metadata.json exists and is already parsed
      const directory = path.dirname(fileAsset.absolutePath);
      const sidecarSiblings = await ingestDb.fileAsset.findByDirectory({
        directoryPath: directory,
        mediaKinds: [MediaKind.SIDECAR],
      });
      const metadataJsonSibling = sidecarSiblings.find(
        (fa) => path.basename(fa.absolutePath).toLowerCase() === "metadata.json",
      );

      if (metadataJsonSibling !== undefined) {
        const siblingMetadata = parseStoredMetadata(metadataJsonSibling.metadata);
        if (siblingMetadata?.source === "audiobook-json" && siblingMetadata.status === "parsed") {
          // Sidecar already parsed; skip this audio file's own ID3 parse.
          // If the audio file was previously marked unparseable (e.g. encoding error),
          // clear it so it no longer shows as a library issue.
          const ownMetadata = parseStoredMetadata(fileAsset.metadata);
          if (ownMetadata?.status === "unparseable") {
            await ingestDb.fileAsset.update({
              where: { id: fileAsset.id },
              data: { metadata: null },
            });
          }

          // Link this audio file to the same edition as the metadata.json sidecar,
          // so that rematch-all and match suggestion display can find it via editionFile queries.
          const sidecarEditionFile = await ingestDb.editionFile.findFirst({
            where: { fileAssetId: metadataJsonSibling.id },
          });
          if (sidecarEditionFile !== null) {
            const existingLink = await ingestDb.editionFile.findFirst({
              where: { fileAssetId: fileAsset.id },
            });
            if (existingLink === null) {
              await ingestDb.editionFile.create({
                data: { editionId: sidecarEditionFile.editionId, fileAssetId: fileAsset.id, role: EditionFileRole.AUDIO_TRACK },
              });
              // Now that this audio file is edition-linked, trigger audio matching
              // so it can find ebook counterparts. The audio file (not the sidecar)
              // is the content that should be matched.
              await enqueueJob(LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS, { fileAssetId: fileAsset.id });
            }
          }

          return {
            availabilityStatus: fileAsset.availabilityStatus,
            fileAssetId: fileAsset.id,
            skipped: true,
          };
        }
      }

      try {
        const { tags: id3Raw, warnings: id3Warnings } = await parseAudioId3(fileAsset.absolutePath);
        const normalized = normalizeAudiobookMetadata(
          {
            title: id3Raw.album ?? id3Raw.title ?? "",
            authors: id3Raw.albumArtist ? [id3Raw.albumArtist] : id3Raw.artist ? [id3Raw.artist] : [],
            narrators: [],
            series: [],
            genres: id3Raw.genres,
          },
          id3Raw,
        );

        const hasEnoughMetadata = normalized.title !== undefined &&
          normalized.title.length > 0 &&
          normalized.authors.length > 0;

        const metadata: ParsedFileAssetMetadata = {
          normalized,
          parsedAt: now.toISOString(),
          parserVersion: AUDIO_ID3_PARSER_VERSION,
          raw: id3Raw,
          source: "audio-id3",
          status: "parsed",
          warnings: id3Warnings,
        };

        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.PRESENT,
            lastSeenAt: now,
            metadata: metadata as object as FileAsset["metadata"],
          },
        });

        if (hasEnoughMetadata) {
          await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
            fileAssetId: fileAsset.id,
          });
        } else {
          // Audiobook lacks full metadata — skip edition matching but still attempt
          // cross-format match suggestion using the stub's directory-derived title
          await enqueueJob(LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS, {
            fileAssetId: fileAsset.id,
          });
        }

        return {
          availabilityStatus: AvailabilityStatus.PRESENT,
          fileAssetId: fileAsset.id,
          metadata,
          skipped: false,
        };
      } catch (error) {
        const errorCode = getErrorCode(error as NodeError);

        if (errorCode === "ENOENT") {
          await ingestDb.fileAsset.update({
            where: { id: fileAsset.id },
            data: {
              availabilityStatus: AvailabilityStatus.MISSING,
              lastSeenAt: now,
            },
          });
          return { availabilityStatus: AvailabilityStatus.MISSING, fileAssetId: fileAsset.id, skipped: false };
        }

        if (isTransientError(error as NodeError)) {
          throw error;
        }

        const warning = error instanceof Error ? error.message : "Unknown audio ID3 parsing error";
        const metadata: ParsedFileAssetMetadata = {
          parsedAt: now.toISOString(),
          parserVersion: AUDIO_ID3_PARSER_VERSION,
          source: "audio-id3",
          status: "unparseable",
          warnings: [warning],
        };

        await ingestDb.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            availabilityStatus: AvailabilityStatus.PRESENT,
            lastSeenAt: now,
            metadata: metadata as object as FileAsset["metadata"],
          },
        });

        return { availabilityStatus: AvailabilityStatus.PRESENT, fileAssetId: fileAsset.id, metadata, skipped: false };
      }
    }

    if (usesPathDerivedEbookMetadata(fileAsset.mediaKind)) {
      const metadata: ParsedFileAssetMetadata = {
        normalized: deriveEbookVariantMetadataFromPath(fileAsset.relativePath),
        parsedAt: now.toISOString(),
        parserVersion: 1,
        source: "filename",
        status: "parsed",
        warnings: [],
      };

      await ingestDb.fileAsset.update({
        where: { id: fileAsset.id },
        data: {
          availabilityStatus: AvailabilityStatus.PRESENT,
          lastSeenAt: now,
          metadata: metadata as object as FileAsset["metadata"],
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
          metadata: metadata as object as FileAsset["metadata"],
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
      const errorCode = getErrorCode(error as NodeError);

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

      if (isTransientError(error as NodeError)) {
        throw error;
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
          metadata: metadata as object as FileAsset["metadata"],
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

  async function findEditionByIdentifiers(
    identifiers: NormalizedBookMetadata["identifiers"] | undefined,
  ): Promise<EditionRecord | null> {
    if (!identifiers?.isbn13 && !identifiers?.isbn10 && !identifiers?.asin) {
      return null;
    }
    return (
      (identifiers.isbn13
        ? await ingestDb.edition.findFirst({ where: { isbn13: identifiers.isbn13 } })
        : null) ??
      (identifiers.isbn10
        ? await ingestDb.edition.findFirst({ where: { isbn10: identifiers.isbn10 } })
        : null) ??
      (identifiers.asin
        ? await ingestDb.edition.findFirst({ where: { asin: identifiers.asin } })
        : null)
    );
  }

  interface MatchContext {
    fileAsset: FileAssetRecord;
    identifiers: NormalizedBookMetadata["identifiers"] | undefined;
    isAudiobook: boolean;
    matchableMetadata: {
      authorCanonicals: string[];
      authors: string[];
      title: string;
      titleCanonical: string;
    };
    storedMetadata: ParsedFileAssetMetadata;
  }

  type FindOrCreateWorkResult =
    | { kind: "earlyReturn"; result: MatchFileAssetToEditionResult }
    | { kind: "workReady"; workId: string; createdWork: boolean };

  async function handleExistingEditionLink(
    fileAsset: FileAssetRecord,
    existingEditionFile: EditionFileRecord,
  ): Promise<MatchFileAssetToEditionResult> {
    const existingEdition = await ingestDb.edition.findUnique({
      where: { id: existingEditionFile.editionId },
    });

    let enqueuedCoverJob = false;
    let enrichedExistingWork = false;
    let mergedIntoWorkId: string | undefined;
    let finalWorkId = existingEdition?.workId;

    if (existingEdition && finalWorkId) {
      const existingWork = await ingestDb.work.findUnique({
        where: { id: finalWorkId },
      });

      if (existingWork?.enrichmentStatus === "STUB") {
        const storedMeta = parseStoredMetadata(fileAsset.metadata);
        const matchableMeta = extractNormalizedMetadataForMatching(fileAsset);

        if (storedMeta?.status === "parsed" && matchableMeta !== undefined) {
          // Check for ISBN/title+author match against other works
          const identifiers = storedMeta.normalized?.identifiers;
          const editionMatch = await findEditionByIdentifiers(identifiers);

          const matchedDifferentWork = editionMatch !== null && editionMatch.workId !== finalWorkId;

          if (!matchedDifferentWork) {
            // Check title+author match
            const matchingWorks = await ingestDb.work.findMany({
              include: { editions: { include: { contributors: { include: { contributor: true } } } } },
              where: { titleCanonical: matchableMeta.titleCanonical },
            });
            const titleAuthorMatch = matchingWorks.find((work) => {
              if (work.id === finalWorkId) return false;
              const existingAuthors = getAuthorCanonicalsForWork(work);
              return existingAuthors.length > 0 &&
                existingAuthors.length === matchableMeta.authorCanonicals.length &&
                existingAuthors.every((author, index) => author === matchableMeta.authorCanonicals[index]);
            });

            if (titleAuthorMatch) {
              // Merge: re-link edition to matched work, delete orphan stub
              await ingestDb.edition.update({
                where: { id: existingEdition.id },
                data: {
                  workId: titleAuthorMatch.id,
                  isbn13: identifiers?.isbn13 ?? null,
                  isbn10: identifiers?.isbn10 ?? null,
                  asin: identifiers?.asin ?? null,
                },
              });
              await ingestDb.work.delete({ where: { id: finalWorkId } });
              mergedIntoWorkId = titleAuthorMatch.id;
              finalWorkId = titleAuthorMatch.id;
              enrichedExistingWork = true;
            } else {
              // No match — enrich the stub in place
              await ingestDb.work.update({
                where: { id: finalWorkId },
                data: {
                  description: storedMeta.normalized?.description ?? null,
                  enrichmentStatus: "ENRICHED",
                  sortTitle: null,
                  titleCanonical: matchableMeta.titleCanonical,
                  titleDisplay: matchableMeta.title,
                },
              });
              await ingestDb.edition.update({
                where: { id: existingEdition.id },
                data: {
                  isbn13: identifiers?.isbn13 ?? null,
                  isbn10: identifiers?.isbn10 ?? null,
                  asin: identifiers?.asin ?? null,
                  language: storedMeta.normalized?.language ?? null,
                },
              });
              await ensureContributors(ingestDb, existingEdition.id, matchableMeta.authors, ContributorRole.AUTHOR);
              enrichedExistingWork = true;
            }
          } else {
            // ISBN matched a different work — merge
            await ingestDb.edition.update({
              where: { id: existingEdition.id },
              data: { workId: editionMatch.workId },
            });
            await ingestDb.work.delete({ where: { id: finalWorkId } });
            mergedIntoWorkId = editionMatch.workId;
            finalWorkId = editionMatch.workId;
            enrichedExistingWork = true;
          }
        }
      }

      await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
        workId: finalWorkId,
        fileAssetId: fileAsset.id,
      });
      enqueuedCoverJob = true;
    }

    return {
      createdEdition: false,
      createdEditionFile: false,
      createdWork: false,
      editionId: existingEdition?.id,
      enrichedExistingWork,
      enqueuedCoverJob,
      fileAssetId: fileAsset.id,
      mediaKind: fileAsset.mediaKind,
      mergedIntoWorkId,
      skipped: false,
      workId: finalWorkId,
    };
  }

  function skippedResult(fileAssetId: string): MatchFileAssetToEditionResult {
    return {
      createdEdition: false,
      createdEditionFile: false,
      createdWork: false,
      enrichedExistingWork: false,
      enqueuedCoverJob: false,
      fileAssetId,
      skipped: true,
    };
  }

  async function matchAudiobookSidecarToSibling(
    ctx: MatchContext,
  ): Promise<MatchFileAssetToEditionResult | null> {
    if (!ctx.isAudiobook || ctx.fileAsset.mediaKind !== MediaKind.SIDECAR) {
      return null;
    }

    const sidecarDir = path.dirname(ctx.fileAsset.absolutePath);
    const siblingAudioFiles = await ingestDb.fileAsset.findByDirectory({
      directoryPath: sidecarDir,
      mediaKinds: [MediaKind.AUDIO],
    });

    if (siblingAudioFiles.length === 0) {
      return null;
    }

    // Batch-fetch all edition-file links for sibling audio files
    const siblingIds = siblingAudioFiles.map((s) => s.id);
    const siblingLinks = await ingestDb.editionFile.findMany({
      where: { fileAssetId: { in: siblingIds } },
    });

    if (siblingLinks.length === 0) {
      // Siblings exist but none are linked to an edition yet.
      // If any have parsed metadata, enqueue matching for them first,
      // then re-enqueue the sidecar so it retries after siblings are linked.
      const parsedSiblings = siblingAudioFiles.filter((s) => {
        const meta = parseStoredMetadata(s.metadata);
        return meta?.status === "parsed";
      });

      if (parsedSiblings.length === 0) {
        return null;
      }

      for (const sibling of parsedSiblings) {
        await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
          fileAssetId: sibling.id,
        });
      }
      await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
        fileAssetId: ctx.fileAsset.id,
      });

      return skippedResult(ctx.fileAsset.id);
    }

    // Batch-fetch all referenced editions
    const editionIds = [...new Set(siblingLinks.map((link) => link.editionId))];
    const editions = await ingestDb.edition.findManyByIds({ ids: editionIds });
    const editionById = new Map(editions.map((e) => [e.id, e]));

    const audiobookEditions = editions.filter(
      (e) => e.formatFamily === FormatFamily.AUDIOBOOK,
    );
    if (audiobookEditions.length === 0) {
      return null;
    }

    // Batch-fetch all works for AUDIOBOOK editions
    const workIds = [...new Set(audiobookEditions.map((e) => e.workId))];
    const works = await ingestDb.work.findManyByIds({ ids: workIds });
    const workById = new Map(works.map((w) => [w.id, w]));

    // Find the first valid match in original sibling order
    for (const sibling of siblingAudioFiles) {
      const link = siblingLinks.find((l) => l.fileAssetId === sibling.id);
      if (!link) continue;

      const siblingEdition = editionById.get(link.editionId);
      if (!siblingEdition || siblingEdition.formatFamily !== FormatFamily.AUDIOBOOK) continue;

      const siblingWork = workById.get(siblingEdition.workId);
      if (!siblingWork) continue;

      // Enrich the work
      if (siblingWork.enrichmentStatus === "STUB") {
        await ingestDb.work.update({
          where: { id: siblingEdition.workId },
          data: {
            description: ctx.storedMetadata.normalized?.description ?? null,
            enrichmentStatus: "ENRICHED",
            sortTitle: null,
            titleCanonical: ctx.matchableMetadata.titleCanonical,
            titleDisplay: ctx.matchableMetadata.title,
          },
        });
      }

      // Enrich the edition
      await ingestDb.edition.update({
        where: { id: siblingEdition.id },
        data: {
          asin: ctx.identifiers?.asin ?? siblingEdition.asin,
          isbn10: ctx.identifiers?.isbn10 ?? siblingEdition.isbn10,
          isbn13: ctx.identifiers?.isbn13 ?? siblingEdition.isbn13,
          language: ctx.storedMetadata.normalized?.language ?? null,
        },
      });

      await ensureContributors(ingestDb, siblingEdition.id, ctx.matchableMetadata.authors, ContributorRole.AUTHOR);

      if (ctx.storedMetadata.normalized?.narrators && ctx.storedMetadata.normalized.narrators.length > 0) {
        await ensureContributors(ingestDb, siblingEdition.id, ctx.storedMetadata.normalized.narrators, ContributorRole.NARRATOR);
      }

      await ensureEditionFileLink(ingestDb, siblingEdition.id, ctx.fileAsset.id);

      await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
        workId: siblingEdition.workId,
        fileAssetId: ctx.fileAsset.id,
      });

      return {
        createdEdition: false,
        createdEditionFile: true,
        createdWork: false,
        editionId: siblingEdition.id,
        enrichedExistingWork: true,
        enqueuedCoverJob: true,
        fileAssetId: ctx.fileAsset.id,
        mediaKind: ctx.fileAsset.mediaKind,
        skipped: false,
        workId: siblingEdition.workId,
      };
    }

    return null;
  }

  async function matchByIdentifiers(
    ctx: MatchContext,
  ): Promise<MatchFileAssetToEditionResult | null> {
    const editionMatch = await findEditionByIdentifiers(ctx.identifiers);

    if (editionMatch === null) {
      return null;
    }

    const editionFileRole = await determineEditionFileRole(ingestDb, editionMatch.id, ctx.fileAsset);
    const createdEditionFile = await ensureEditionFileLink(
      ingestDb,
      editionMatch.id,
      ctx.fileAsset.id,
      editionFileRole,
    );

    await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
      workId: editionMatch.workId,
      fileAssetId: ctx.fileAsset.id,
    });

    return {
      createdEdition: false,
      createdEditionFile,
      createdWork: false,
      editionId: editionMatch.id,
      enrichedExistingWork: false,
      enqueuedCoverJob: true,
      fileAssetId: ctx.fileAsset.id,
      mediaKind: ctx.fileAsset.mediaKind,
      skipped: false,
      workId: editionMatch.workId,
    };
  }

  async function findOrCreateWork(
    ctx: MatchContext,
  ): Promise<FindOrCreateWorkResult> {
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
      where: { titleCanonical: ctx.matchableMetadata.titleCanonical },
    });
    let matchingWork = matchingWorks.find((work) => {
      const existingAuthors = getAuthorCanonicalsForWork(work);
      return existingAuthors.length > 0 &&
        existingAuthors.length === ctx.matchableMetadata.authorCanonicals.length &&
        existingAuthors.every((author, index) => author === ctx.matchableMetadata.authorCanonicals[index]);
    });

    // Fallback for audiobook stubs: match by title when stub has no authors
    if (matchingWork === undefined && ctx.isAudiobook) {
      matchingWork = matchingWorks.find((work) =>
        work.enrichmentStatus === "STUB" &&
        getAuthorCanonicalsForWork(work).length === 0,
      );
    }

    if (matchingWork === undefined) {
      const createdWorkRecord = await ingestDb.work.create({
        data: {
          sortTitle: null,
          titleCanonical: ctx.matchableMetadata.titleCanonical,
          titleDisplay: ctx.matchableMetadata.title,
        },
      });
      return { kind: "workReady", workId: createdWorkRecord.id, createdWork: true };
    }

    const workId = matchingWork.id;

    if (!ctx.isAudiobook && isEbookVariant(ctx.fileAsset.mediaKind)) {
      const existingEbookEdition = matchingWork.editions.find(
        (edition) => edition.formatFamily === FormatFamily.EBOOK,
      );

      if (existingEbookEdition) {
        await ingestDb.edition.update({
          where: { id: existingEbookEdition.id },
          data: {
            asin: ctx.identifiers?.asin ?? existingEbookEdition.asin,
            isbn10: ctx.identifiers?.isbn10 ?? existingEbookEdition.isbn10,
            isbn13: ctx.identifiers?.isbn13 ?? existingEbookEdition.isbn13,
            language: ctx.storedMetadata.normalized?.language ?? existingEbookEdition.language,
          },
        });

        await ensureContributors(
          ingestDb,
          existingEbookEdition.id,
          ctx.matchableMetadata.authors,
          ContributorRole.AUTHOR,
        );

        const editionFileRole = await determineEditionFileRole(
          ingestDb,
          existingEbookEdition.id,
          ctx.fileAsset,
        );
        const createdEditionFile = await ensureEditionFileLink(
          ingestDb,
          existingEbookEdition.id,
          ctx.fileAsset.id,
          editionFileRole,
        );

        await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
          workId,
          fileAssetId: ctx.fileAsset.id,
        });

        return {
          kind: "earlyReturn",
          result: {
            createdEdition: false,
            createdEditionFile,
            createdWork: false,
            editionId: existingEbookEdition.id,
            enrichedExistingWork: matchingWork.enrichmentStatus === "STUB",
            enqueuedCoverJob: true,
            fileAssetId: ctx.fileAsset.id,
            mediaKind: ctx.fileAsset.mediaKind,
            skipped: false,
            workId,
          },
        };
      }
    }

    // Enrich stub work with sidecar metadata
    if (matchingWork.enrichmentStatus === "STUB") {
      await ingestDb.work.update({
        where: { id: matchingWork.id },
        data: {
          description: ctx.storedMetadata.normalized?.description ?? null,
          enrichmentStatus: "ENRICHED",
          sortTitle: null,
          titleCanonical: ctx.matchableMetadata.titleCanonical,
          titleDisplay: ctx.matchableMetadata.title,
        },
      });

      // Check if the stub work already has an audiobook edition we should enrich
      // instead of creating a new one (e.g., SCAN created a stub edition from the .m4b)
      if (ctx.isAudiobook) {
        const existingAudioEdition = matchingWork.editions.find(
          (e) => e.formatFamily === FormatFamily.AUDIOBOOK,
        );

        if (existingAudioEdition) {
          // Enrich existing edition with sidecar metadata
          await ingestDb.edition.update({
            where: { id: existingAudioEdition.id },
            data: {
              asin: ctx.identifiers?.asin ?? existingAudioEdition.asin,
              isbn10: ctx.identifiers?.isbn10 ?? existingAudioEdition.isbn10,
              isbn13: ctx.identifiers?.isbn13 ?? existingAudioEdition.isbn13,
              language: ctx.storedMetadata.normalized?.language ?? null,
            },
          });

          await ensureContributors(ingestDb, existingAudioEdition.id, ctx.matchableMetadata.authors, ContributorRole.AUTHOR);

          if (ctx.storedMetadata.normalized?.narrators && ctx.storedMetadata.normalized.narrators.length > 0) {
            await ensureContributors(ingestDb, existingAudioEdition.id, ctx.storedMetadata.normalized.narrators, ContributorRole.NARRATOR);
          }

          await ensureEditionFileLink(ingestDb, existingAudioEdition.id, ctx.fileAsset.id);

          await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
            workId,
            fileAssetId: ctx.fileAsset.id,
          });

          return {
            kind: "earlyReturn",
            result: {
              createdEdition: false,
              createdEditionFile: true,
              createdWork: false,
              editionId: existingAudioEdition.id,
              enrichedExistingWork: true,
              enqueuedCoverJob: true,
              fileAssetId: ctx.fileAsset.id,
              mediaKind: ctx.fileAsset.mediaKind,
              skipped: false,
              workId,
            },
          };
        }
      }
    }

    return { kind: "workReady", workId, createdWork: false };
  }

  async function createEditionAndLinkFiles(
    ctx: MatchContext,
    workId: string,
    createdWork: boolean,
  ): Promise<MatchFileAssetToEditionResult> {
    const formatFamily = ctx.isAudiobook ? FormatFamily.AUDIOBOOK : FormatFamily.EBOOK;

    const createdEdition = await ingestDb.edition.create({
      data: {
        asin: ctx.identifiers?.asin ?? null,
        formatFamily,
        isbn10: ctx.identifiers?.isbn10 ?? null,
        isbn13: ctx.identifiers?.isbn13 ?? null,
        language: ctx.storedMetadata.normalized?.language ?? null,
        publishedAt: null,
        publisher: null,
        workId,
      },
    });

    await ensureContributors(ingestDb, createdEdition.id, ctx.matchableMetadata.authors, ContributorRole.AUTHOR);

    // Add narrator contributors for audiobooks
    if (ctx.isAudiobook && ctx.storedMetadata.normalized?.narrators && ctx.storedMetadata.normalized.narrators.length > 0) {
      await ensureContributors(ingestDb, createdEdition.id, ctx.storedMetadata.normalized.narrators, ContributorRole.NARRATOR);
    }

    const createdEditionFile = await ensureEditionFileLink(ingestDb, createdEdition.id, ctx.fileAsset.id);

    // Link sibling audio files as AUDIO_TRACK for audiobook editions
    if (ctx.isAudiobook) {
      const directory = path.dirname(ctx.fileAsset.absolutePath);
      const audioSiblings = await ingestDb.fileAsset.findByDirectory({
        directoryPath: directory,
        mediaKinds: [MediaKind.AUDIO],
      });

      for (const sibling of audioSiblings) {
        const existingSiblingLink = await ingestDb.editionFile.findFirst({
          where: { fileAssetId: sibling.id },
        });
        if (existingSiblingLink === null) {
          await ingestDb.editionFile.create({
            data: {
              editionId: createdEdition.id,
              fileAssetId: sibling.id,
              role: EditionFileRole.AUDIO_TRACK,
            },
          });
        }
      }
    }

    await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
      workId,
      fileAssetId: ctx.fileAsset.id,
    });

    return {
      createdEdition: true,
      createdEditionFile,
      createdWork,
      editionId: createdEdition.id,
      enrichedExistingWork: false,
      enqueuedCoverJob: true,
      fileAssetId: ctx.fileAsset.id,
      mediaKind: ctx.fileAsset.mediaKind,
      skipped: false,
      workId,
    };
  }

  async function matchFileAssetToEdition(
    input: MatchFileAssetToEditionInput,
  ): Promise<MatchFileAssetToEditionResult> {
    const DUPLICATE_CONTENT_MEDIA_KINDS: ReadonlySet<string> = new Set([
      MediaKind.EPUB,
      MediaKind.KEPUB,
      MediaKind.MOBI,
      MediaKind.AZW,
      MediaKind.AZW3,
      MediaKind.PDF,
      MediaKind.CBZ,
    ]);
    const MATCH_SUGGESTION_MEDIA_KINDS: ReadonlySet<string> = new Set([
      MediaKind.EPUB,
      MediaKind.KEPUB,
      MediaKind.MOBI,
      MediaKind.AZW,
      MediaKind.AZW3,
      MediaKind.PDF,
      MediaKind.CBZ,
      MediaKind.AUDIO,
    ]);
    const result = await matchFileAssetToEditionCore(input);
    if (!result.skipped && result.mediaKind !== undefined && DUPLICATE_CONTENT_MEDIA_KINDS.has(result.mediaKind)) {
      await enqueueJob(LIBRARY_JOB_NAMES.DETECT_DUPLICATES, { fileAssetId: input.fileAssetId });
    }
    if (!result.skipped && result.mediaKind !== undefined && MATCH_SUGGESTION_MEDIA_KINDS.has(result.mediaKind)) {
      await enqueueJob(LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS, { fileAssetId: input.fileAssetId });
    }
    return result;
  }

  async function matchFileAssetToEditionCore(
    input: MatchFileAssetToEditionInput,
  ): Promise<MatchFileAssetToEditionResult> {
    const fileAsset = await ingestDb.fileAsset.findUnique({
      where: { id: input.fileAssetId },
    });

    const matchableMediaKinds: Set<MediaKind> = new Set([
      MediaKind.EPUB,
      MediaKind.KEPUB,
      MediaKind.MOBI,
      MediaKind.AZW,
      MediaKind.AZW3,
      MediaKind.AUDIO,
      MediaKind.SIDECAR,
    ]);

    if (fileAsset === null || !matchableMediaKinds.has(fileAsset.mediaKind)) {
      return skippedResult(input.fileAssetId);
    }

    const isAudiobook = fileAsset.mediaKind === MediaKind.AUDIO ||
      (fileAsset.mediaKind === MediaKind.SIDECAR &&
        path.basename(fileAsset.absolutePath).toLowerCase() === "metadata.json");

    const existingEditionFile = await ingestDb.editionFile.findFirst({
      where: { fileAssetId: fileAsset.id },
    });

    if (existingEditionFile !== null) {
      return handleExistingEditionLink(fileAsset, existingEditionFile);
    }

    const storedMetadata = parseStoredMetadata(fileAsset.metadata);
    const matchableMetadata = extractNormalizedMetadataForMatching(fileAsset);

    if (storedMetadata?.status !== "parsed" || matchableMetadata === undefined) {
      return skippedResult(fileAsset.id);
    }

    const ctx: MatchContext = {
      fileAsset,
      identifiers: storedMetadata.normalized?.identifiers,
      isAudiobook,
      matchableMetadata,
      storedMetadata,
    };

    const sidecarResult = await matchAudiobookSidecarToSibling(ctx);
    if (sidecarResult !== null) return sidecarResult;

    const identifierResult = await matchByIdentifiers(ctx);
    if (identifierResult !== null) return identifierResult;

    const workResult = await findOrCreateWork(ctx);
    if (workResult.kind === "earlyReturn") return workResult.result;

    return createEditionAndLinkFiles(ctx, workResult.workId, workResult.createdWork);
  }

  async function detectDuplicates(
    input: DetectDuplicatesInput,
  ): Promise<DetectDuplicatesResult> {
    return detectDuplicatesImpl(input, ingestDb);
  }

  async function matchSuggestions(
    input: MatchSuggestionsInput,
  ): Promise<MatchSuggestionsResult> {
    return matchSuggestionsImpl(input, ingestDb);
  }

  async function mergeWorksById(
    survivingWorkId: string,
    losingWorkId: string,
  ): Promise<void> {
    const survivingWork = await ingestDb.work.findUnique({ where: { id: survivingWorkId } });
    const losingWork = await ingestDb.work.findUnique({ where: { id: losingWorkId } });
    if (!survivingWork || !losingWork) {
      throw new Error(`Cannot merge: work not found (surviving=${survivingWorkId}, losing=${losingWorkId})`);
    }
    await mergeWorks(ingestDb, survivingWork, losingWork);
  }

  return {
    detectDuplicates,
    hashFileAsset,
    matchSuggestions,
    matchFileAssetToEdition,
    mergeWorksById,
    parseFileAssetMetadata,
    scanLibraryRoot,
  };
}

const services = createIngestServices();

export const scanLibraryRoot = services.scanLibraryRoot;
export const hashFileAsset = services.hashFileAsset;
export const matchSuggestions = services.matchSuggestions;
export const matchFileAssetToEdition = services.matchFileAssetToEdition;
export const parseFileAssetMetadata = services.parseFileAssetMetadata;
export const detectDuplicates = services.detectDuplicates;
export const mergeWorksById = services.mergeWorksById;
export { classifyMediaKind, deriveFormatFamily, getFileExtension, hashFileContents, IGNORED_BASENAMES, isFileChanged, isIgnoredBasename, normalizeRelativePath, normalizeRootPath, walkRegularFiles };
export { parseEpubMetadata } from "./epub";
export { parseOpfSidecar } from "./opf";
export { parseAudiobookMetadataJson, parseAudioId3Tags, type ParseAudioId3Result } from "./audiobook";
export {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  createIdentifierMap,
  normalizeAudiobookMetadata,
  normalizeBookMetadata,
  normalizeOpfMetadata,
} from "./metadata";
export type { ParsedAudiobookMetadataJsonRaw, ParsedAudioId3TagsRaw } from "./audiobook";
export type { NormalizedBookMetadata, ParsedEpubMetadataRaw, ParsedOpfMetadataRaw };
