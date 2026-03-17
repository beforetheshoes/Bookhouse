import path from "node:path";
import { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import {
  AvailabilityStatus,
  type FileAsset,
  MediaKind,
  type LibraryRoot,
} from "@bookhouse/domain";
import { db } from "@bookhouse/db";
import {
  LIBRARY_JOB_NAMES,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type ParseFileAssetMetadataJobPayload,
  QUEUES,
  getQueueConnectionConfig,
} from "@bookhouse/shared";
import { classifyMediaKind, getFileExtension, normalizeRelativePath, normalizeRootPath } from "./classification";
import { parseEpubMetadata, type ParsedEpubMetadataRaw } from "./epub";
import { hashFileContents } from "./hashing";
import { normalizeBookMetadata, type NormalizedBookMetadata } from "./metadata";

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
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;

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

      return {
        availabilityStatus: AvailabilityStatus.PRESENT,
        fileAssetId: fileAsset.id,
        metadata,
        skipped: false,
      };
    } catch (error) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;

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

  return {
    hashFileAsset,
    parseFileAssetMetadata,
    scanLibraryRoot,
  };
}

const services = createIngestServices();

export const scanLibraryRoot = services.scanLibraryRoot;
export const hashFileAsset = services.hashFileAsset;
export const parseFileAssetMetadata = services.parseFileAssetMetadata;
export { classifyMediaKind, getFileExtension, hashFileContents, isFileChanged, normalizeRelativePath, normalizeRootPath, walkRegularFiles };
export { parseEpubMetadata } from "./epub";
export { createIdentifierMap, normalizeBookMetadata } from "./metadata";
export type { NormalizedBookMetadata, ParsedEpubMetadataRaw };
