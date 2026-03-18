import path from "node:path";
import { Dirent } from "node:fs";
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

const EPUB_PARSER_VERSION = 1;


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
export {
  canonicalizeBookTitle,
  canonicalizeContributorName,
  canonicalizeContributorNames,
  createIdentifierMap,
  normalizeBookMetadata,
} from "./metadata";
export type { NormalizedBookMetadata, ParsedEpubMetadataRaw };
