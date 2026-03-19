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
  type Work,
} from "@bookhouse/domain";
import { db, type EditionContributor } from "@bookhouse/db";
import {
  LIBRARY_JOB_NAMES,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  enqueueLibraryJob,
} from "@bookhouse/shared";
import { classifyMediaKind, getFileExtension, normalizeRelativePath, normalizeRootPath } from "./classification";
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
  source: "epub" | "opf-sidecar" | "audiobook-json" | "audio-id3";
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
type WorkRecord = Pick<Work, "description" | "id" | "language" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">;
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
    findByDirectory(args: { directoryPath: string; mediaKinds: MediaKind[] }): Promise<FileAssetRecord[]>;
    findMany(args: FileAssetFindManyArgs): Promise<FileAssetRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<FileAssetRecord | null>;
    update(args: FileAssetUpdateArgs): Promise<FileAssetRecord>;
    upsert(args: FileAssetUpsertArgs): Promise<FileAssetRecord>;
  };
  work: {
    create(args: WorkCreateArgs): Promise<WorkRecord>;
    findMany(args: WorkFindManyArgs): Promise<WorkMatchRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<WorkRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<Work, "description" | "language" | "seriesId" | "seriesPosition">> }): Promise<WorkRecord>;
  };
  edition: {
    create(args: EditionCreateArgs): Promise<EditionRecord>;
    findFirst(args: EditionFindFirstArgs): Promise<EditionRecord | null>;
    findUnique(args: { where: { id: string } }): Promise<EditionRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<Edition, "publisher" | "publishedAt">> }): Promise<EditionRecord>;
  };
  series: {
    upsert(args: { name: string }): Promise<{ id: string; name: string }>;
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
  listDirectory: ListDirectoryFn;
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
}

export interface ScanLibraryRootInput {
  libraryRootId: string;
  now?: Date;
  reportProgress?: (data: ScanProgressData) => Promise<void>;
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
  enqueuedCoverJob: boolean;
  fileAssetId: string;
  skipped: boolean;
  workId?: string;
}

const EPUB_PARSER_VERSION = 1;
const OPF_PARSER_VERSION = 1;
const AUDIOBOOK_JSON_PARSER_VERSION = 1;
const AUDIO_ID3_PARSER_VERSION = 1;
export const SCAN_PROGRESS_INTERVAL = 50;


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

  const candidate = metadata as Record<string, unknown>;
  const source = candidate["source"];
  const status = candidate["status"];

  if (
    (source !== "epub" && source !== "opf-sidecar" && source !== "audiobook-json" && source !== "audio-id3") ||
    (status !== "parsed" && status !== "unparseable")
  ) {
    return undefined;
  }

  return candidate as unknown as ParsedFileAssetMetadata;
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

function createDefaultIngestDb(): IngestDb {
  const prisma = db;
  return {
    libraryRoot: prisma.libraryRoot as unknown as IngestDb["libraryRoot"],
    fileAsset: {
      ...(prisma.fileAsset as unknown as Omit<IngestDb["fileAsset"], "findByDirectory">),
      async findByDirectory(args: { directoryPath: string; mediaKinds: MediaKind[] }) {
        return prisma.fileAsset.findMany({
          where: {
            absolutePath: { startsWith: args.directoryPath + "/" },
            mediaKind: { in: args.mediaKinds },
          },
        }) as unknown as Promise<FileAssetRecord[]>;
      },
    },
    work: {
      ...(prisma.work as unknown as Omit<IngestDb["work"], "update">),
      async update(args: { where: { id: string }; data: Partial<Pick<Work, "description" | "language" | "seriesId" | "seriesPosition">> }) {
        return prisma.work.update(args) as unknown as Promise<WorkRecord>;
      },
    },
    edition: {
      ...(prisma.edition as unknown as Omit<IngestDb["edition"], "update">),
      async update(args: { where: { id: string }; data: Partial<Pick<Edition, "publisher" | "publishedAt">> }) {
        return prisma.edition.update(args) as unknown as Promise<EditionRecord>;
      },
    },
    editionFile: prisma.editionFile as unknown as IngestDb["editionFile"],
    contributor: prisma.contributor as unknown as IngestDb["contributor"],
    editionContributor: prisma.editionContributor as unknown as IngestDb["editionContributor"],
    series: {
      async upsert(args: { name: string }) {
        const existing = await prisma.series.findFirst({ where: { name: args.name } });
        if (existing) return { id: existing.id, name: existing.name };
        const created = await prisma.series.create({ data: { name: args.name } });
        return { id: created.id, name: created.name };
      },
    },
  };
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

  async function scanLibraryRoot(input: ScanLibraryRootInput): Promise<ScanLibraryRootResult> {
    const now = input.now ?? new Date();
    const reportProgress = input.reportProgress;
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

    if (reportProgress) {
      await reportProgress({ totalFiles: discoveredPaths.length });
    }

    let processedFiles = 0;
    let errorCount = 0;

    for (const absolutePath of discoveredPaths) {
      let fileStats;

      try {
        fileStats = await readStats(absolutePath);
      } catch {
        processedFiles++;
        errorCount++;
        if (reportProgress && processedFiles % SCAN_PROGRESS_INTERVAL === 0) {
          await reportProgress({ processedFiles, errorCount });
        }
        continue;
      }

      if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
        processedFiles++;
        if (reportProgress && processedFiles % SCAN_PROGRESS_INTERVAL === 0) {
          await reportProgress({ processedFiles, errorCount });
        }
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

      processedFiles++;
      if (reportProgress && processedFiles % SCAN_PROGRESS_INTERVAL === 0) {
        await reportProgress({ processedFiles, errorCount });
      }
    }


    if (reportProgress) {
      await reportProgress({ processedFiles, errorCount });
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

      if (
        fileAsset.mediaKind === MediaKind.EPUB ||
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
            metadata: metadata as unknown as FileAsset["metadata"],
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
          const editionUpdates: Record<string, unknown> = {};
          if (!edition.publisher && normalized.publisher) editionUpdates.publisher = normalized.publisher;
          if (!edition.publishedAt && normalized.date) {
            const parsedDate = new Date(normalized.date);
            if (!isNaN(parsedDate.getTime())) editionUpdates.publishedAt = parsedDate;
          }

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

          const workUpdates: Record<string, unknown> = {};
          if (!work.description && normalized.description) workUpdates.description = normalized.description;
          if (!work.language && normalized.language) workUpdates.language = normalized.language;

          if (!work.seriesId && normalized.series) {
            const series = await ingestDb.series.upsert({
              name: normalized.series.name,
            });
            workUpdates.seriesId = series.id;
            if (normalized.series.index !== undefined) {
              workUpdates.seriesPosition = normalized.series.index;
            }
          }

          if (Object.keys(workUpdates).length > 0) {
            await ingestDb.work.update({
              where: { id: work.id },
              data: workUpdates,
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
        const errorCode = getErrorCode(error);

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
            metadata: metadata as unknown as FileAsset["metadata"],
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
            id3Raw = await parseAudioId3(firstAudioSibling.absolutePath);
          } catch {
            // ID3 parsing failure is non-fatal for sidecar flow
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
          return { availabilityStatus: AvailabilityStatus.MISSING, fileAssetId: fileAsset.id, skipped: false };
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
            metadata: metadata as unknown as FileAsset["metadata"],
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
          // Sidecar already parsed; skip this audio file
          return {
            availabilityStatus: fileAsset.availabilityStatus,
            fileAssetId: fileAsset.id,
            skipped: true,
          };
        }
      }

      try {
        const id3Raw = await parseAudioId3(fileAsset.absolutePath);
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

        if (hasEnoughMetadata) {
          await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
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
        const errorCode = getErrorCode(error);

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
            metadata: metadata as unknown as FileAsset["metadata"],
          },
        });

        return { availabilityStatus: AvailabilityStatus.PRESENT, fileAssetId: fileAsset.id, metadata, skipped: false };
      }
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

    const matchableMediaKinds: Set<MediaKind> = new Set([MediaKind.EPUB, MediaKind.AUDIO, MediaKind.SIDECAR]);

    if (fileAsset === null || !matchableMediaKinds.has(fileAsset.mediaKind)) {
      return {
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        enqueuedCoverJob: false,
        fileAssetId: input.fileAssetId,
        skipped: true,
      };
    }

    const isAudiobook = fileAsset.mediaKind === MediaKind.AUDIO ||
      (fileAsset.mediaKind === MediaKind.SIDECAR &&
        path.basename(fileAsset.absolutePath).toLowerCase() === "metadata.json");

    const existingEditionFile = await ingestDb.editionFile.findFirst({
      where: { fileAssetId: fileAsset.id },
    });

    if (existingEditionFile !== null) {
      const existingEdition = await ingestDb.edition.findUnique({
        where: { id: existingEditionFile.editionId },
      });

      let enqueuedCoverJob = false;
      if (existingEdition?.workId) {
        await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
          workId: existingEdition.workId,
          fileAssetId: fileAsset.id,
        });
        enqueuedCoverJob = true;
      }

      return {
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        editionId: existingEdition?.id,
        enqueuedCoverJob,
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
        enqueuedCoverJob: false,
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

      await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
        workId: editionMatch.workId,
        fileAssetId: fileAsset.id,
      });

      return {
        createdEdition: false,
        createdEditionFile,
        createdWork: false,
        editionId: editionMatch.id,
        enqueuedCoverJob: true,
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

    const formatFamily = isAudiobook ? FormatFamily.AUDIOBOOK : FormatFamily.EBOOK;

    const createdEdition = await ingestDb.edition.create({
      data: {
        asin: identifiers?.asin ?? null,
        formatFamily,
        isbn10: identifiers?.isbn10 ?? null,
        isbn13: identifiers?.isbn13 ?? null,
        publishedAt: null,
        publisher: null,
        workId,
      },
    });

    await ensureContributors(ingestDb, createdEdition.id, matchableMetadata.authors, ContributorRole.AUTHOR);

    // Add narrator contributors for audiobooks
    if (isAudiobook && storedMetadata.normalized?.narrators && storedMetadata.normalized.narrators.length > 0) {
      await ensureContributors(ingestDb, createdEdition.id, storedMetadata.normalized.narrators, ContributorRole.NARRATOR);
    }

    const createdEditionFile = await ensureEditionFileLink(ingestDb, createdEdition.id, fileAsset.id);

    // Link sibling audio files as AUDIO_TRACK for audiobook editions
    if (isAudiobook) {
      const directory = path.dirname(fileAsset.absolutePath);
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
      fileAssetId: fileAsset.id,
    });

    return {
      createdEdition: true,
      createdEditionFile,
      createdWork,
      editionId: createdEdition.id,
      enqueuedCoverJob: true,
      fileAssetId: fileAsset.id,
      skipped: false,
      workId,
    };
  }

  return {
    hashFileAsset,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    scanLibraryRoot,
  };
}

const services = createIngestServices();

export const scanLibraryRoot = services.scanLibraryRoot;
export const hashFileAsset = services.hashFileAsset;
export const matchFileAssetToEdition = services.matchFileAssetToEdition;
export const parseFileAssetMetadata = services.parseFileAssetMetadata;
export { classifyMediaKind, getFileExtension, hashFileContents, isFileChanged, normalizeRelativePath, normalizeRootPath, walkRegularFiles };
export { parseEpubMetadata } from "./epub";
export { parseOpfSidecar } from "./opf";
export { parseAudiobookMetadataJson, parseAudioId3Tags } from "./audiobook";
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
