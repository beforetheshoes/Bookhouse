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
  createLogger,
  LIBRARY_JOB_NAMES,
  type HashFileAssetJobPayload,
  type LibraryJobName,
  type LibraryJobPayload,
  type MatchFileAssetToEditionJobPayload,
  type ParseFileAssetMetadataJobPayload,
  enqueueLibraryJob,
} from "@bookhouse/shared";
import { classifyMediaKind, deriveFormatFamily, getFileExtension, normalizeRelativePath, normalizeRootPath } from "./classification";
import { normalizedSimilarity } from "./similarity";
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
  source: "epub" | "opf-sidecar" | "audiobook-json" | "audio-id3";
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
  | "sizeBytes"
>;

type LibraryRootRecord = Pick<LibraryRoot, "id" | "lastScannedAt" | "path">;
type WorkRecord = Pick<Work, "coverPath" | "description" | "enrichmentStatus" | "id" | "language" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">;
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

interface AudioLinkRecord {
  id: string;
  ebookEditionId: string;
  audioEditionId: string;
  matchType: string;
  confidence: number | null;
  reviewStatus: string;
}

interface AudioLinkCreateArgs {
  data: {
    ebookEditionId: string;
    audioEditionId: string;
    matchType: string;
    confidence: number;
  };
}

interface AudioLinkFindFirstArgs {
  where: {
    ebookEditionId: string;
    audioEditionId: string;
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
  };
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
    delete(args: { where: { id: string } }): Promise<void>;
    findMany(args: WorkFindManyArgs): Promise<WorkMatchRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<WorkRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<Work, "coverPath" | "description" | "enrichmentStatus" | "language" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">> }): Promise<WorkRecord>;
  };
  edition: {
    create(args: EditionCreateArgs): Promise<EditionRecord>;
    findFirst(args: EditionFindFirstArgs): Promise<EditionRecord | null>;
    findMany(args: EditionFindManyArgs): Promise<EditionRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<EditionRecord | null>;
    update(args: { where: { id: string }; data: Partial<Pick<Edition, "asin" | "isbn10" | "isbn13" | "publisher" | "publishedAt" | "workId">> }): Promise<EditionRecord>;
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
  duplicateCandidate: {
    create(args: DuplicateCandidateCreateArgs): Promise<DuplicateCandidateRecord>;
    findFirst(args: DuplicateCandidateFindFirstArgs): Promise<DuplicateCandidateRecord | null>;
  };
  audioLink: {
    create(args: AudioLinkCreateArgs): Promise<AudioLinkRecord>;
    findFirst(args: AudioLinkFindFirstArgs): Promise<AudioLinkRecord | null>;
  };
}

export interface IngestLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface IngestDependencies {
  db: IngestDb;
  enqueueLibraryJob<TName extends LibraryJobName>(
    jobName: TName,
    payload: LibraryJobPayload<TName>,
  ): Promise<void>;
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
}

export interface ScanLibraryRootInput {
  libraryRootId: string;
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

export interface MatchAudioInput {
  fileAssetId: string;
}

export interface MatchAudioResult {
  fileAssetId: string;
  skipped: boolean;
  linksCreated: number;
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

function computeAuthorSimilarity(authorsA: string[], authorsB: string[]): number {
  if (authorsA.length === 0 || authorsB.length === 0) return 0;
  const joinedA = authorsA.join(" ");
  const joinedB = authorsB.join(" ");
  return normalizedSimilarity(joinedA, joinedB);
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
      async update(args: { where: { id: string }; data: Partial<Pick<Work, "coverPath" | "description" | "enrichmentStatus" | "language" | "seriesId" | "seriesPosition" | "sortTitle" | "titleCanonical" | "titleDisplay">> }) {
        return prisma.work.update(args) as unknown as Promise<WorkRecord>;
      },
    },
    edition: {
      ...(prisma.edition as unknown as Omit<IngestDb["edition"], "update">),
      async update(args: { where: { id: string }; data: Partial<Pick<Edition, "asin" | "isbn10" | "isbn13" | "publisher" | "publishedAt" | "workId">> }) {
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
    duplicateCandidate: prisma.duplicateCandidate as unknown as IngestDb["duplicateCandidate"],
    audioLink: prisma.audioLink as unknown as IngestDb["audioLink"],
  };
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

  let candidatesCreated = 0;

  // Strategy A: SAME_HASH
  if (fileAsset.fullHash) {
    const hashMatches = await ingestDb.fileAsset.findMany({
      where: { fullHash: fileAsset.fullHash, NOT: { id: fileAsset.id } },
    });
    for (const match of hashMatches) {
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
      where: { OR: isbnClauses, NOT: { id: edition.id } },
    });
    for (const match of isbnMatches) {
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
  const work = await ingestDb.work.findUnique({ where: { id: edition.workId } });
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

async function audioLinkPairExists(
  alDb: IngestDb["audioLink"],
  ebookEditionId: string,
  audioEditionId: string,
): Promise<boolean> {
  const existing = await alDb.findFirst({
    where: { ebookEditionId, audioEditionId },
  });
  return existing !== null;
}

const FILENAME_BOOST_THRESHOLD = 0.8;
const CONFIDENCE_BOOST = 0.05;

async function matchAudioImpl(
  input: MatchAudioInput,
  ingestDb: IngestDb,
): Promise<MatchAudioResult> {
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

  const targetFormat = isAudiobook ? "EBOOK" : "AUDIOBOOK";
  let linksCreated = 0;

  const myEdition = edition;
  const myFileAsset = fileAsset;

  async function createLinkForEdition(
    otherEdition: EditionRecord,
    confidence: number,
    matchType: string,
  ): Promise<void> {
    const ebookEditionId = isAudiobook ? otherEdition.id : myEdition.id;
    const audioEditionId = isAudiobook ? myEdition.id : otherEdition.id;

    const alreadyExists = await audioLinkPairExists(
      ingestDb.audioLink,
      ebookEditionId,
      audioEditionId,
    );
    if (alreadyExists) return;

    let finalConfidence = confidence;

    // Filename similarity boost
    const otherEditionFile = await ingestDb.editionFile.findFirst({
      where: { editionId: otherEdition.id },
    });
    if (otherEditionFile) {
      const otherFileAsset = await ingestDb.fileAsset.findUnique({
        where: { id: otherEditionFile.fileAssetId },
      });
      if (otherFileAsset) {
        const myBase = myFileAsset.basename.replace(/\.[^.]+$/, "").toLowerCase();
        const otherBase = otherFileAsset.basename.replace(/\.[^.]+$/, "").toLowerCase();
        if (normalizedSimilarity(myBase, otherBase) >= FILENAME_BOOST_THRESHOLD) {
          finalConfidence += CONFIDENCE_BOOST;
        }

        // Folder proximity boost
        const myDir = path.dirname(myFileAsset.absolutePath);
        const otherDir = path.dirname(otherFileAsset.absolutePath);
        if (myDir === otherDir || path.dirname(myDir) === path.dirname(otherDir)) {
          finalConfidence += CONFIDENCE_BOOST;
        }
      }
    }

    finalConfidence = Math.min(finalConfidence, 1.0);

    await ingestDb.audioLink.create({
      data: {
        ebookEditionId,
        audioEditionId,
        matchType,
        confidence: finalConfidence,
      },
    });
    linksCreated += 1;
  }

  // Check same-work editions of opposite format (SAME_WORK match type)
  const myWorkMatches = await ingestDb.work.findMany({
    where: { titleCanonical: work.titleCanonical },
    include: { editions: { include: { contributors: { include: { contributor: true } } } } },
  });
  // The work is guaranteed to be in results since we queried by its own titleCanonical
  const myWork = myWorkMatches.find((w) => w.id === work.id) as typeof myWorkMatches[number];
  const myAuthors = getAuthorCanonicalsForWork(myWork);

  const sameWorkOpposite = myWork.editions.filter(
    (e) => e.formatFamily === targetFormat && e.id !== edition.id,
  );
  for (const otherEdition of sameWorkOpposite) {
    await createLinkForEdition(otherEdition, 1.0, "SAME_WORK");
  }

  // Check cross-work editions of opposite format (EXACT_METADATA match type)
  const otherWorks = await ingestDb.work.findMany({
    where: { NOT: { id: work.id } },
    include: { editions: { include: { contributors: { include: { contributor: true } } } } },
  });

  for (const otherWork of otherWorks) {
    if (!otherWork.titleCanonical) continue;

    const titleSim = normalizedSimilarity(work.titleCanonical, otherWork.titleCanonical);
    if (titleSim < SIMILARITY_THRESHOLD) continue;

    const otherAuthors = getAuthorCanonicalsForWork(otherWork);
    if (myAuthors.length === 0 && otherAuthors.length === 0) continue;

    const authorSim = computeAuthorSimilarity(myAuthors, otherAuthors);
    if (authorSim < SIMILARITY_THRESHOLD) continue;

    const oppositeEditions = otherWork.editions.filter((e) => e.formatFamily === targetFormat);

    for (const otherEdition of oppositeEditions) {
      await createLinkForEdition(otherEdition, Math.min(titleSim, authorSim), "EXACT_METADATA");
    }
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
    const enqueuedRecoveryJobs: string[] = [];
    const createdStubWorkIds: string[] = [];
    const seenAudioDirs = new Map<string, { workId: string; editionId: string }>();

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
      } else {
        // Recovery: re-enqueue jobs for existing unchanged files with incomplete processing
        const recoveryFormatFamily = deriveFormatFamily(upsertedFileAsset.mediaKind);
        if (recoveryFormatFamily !== null && upsertedFileAsset.fullHash !== null) {
          // Check EditionFile link FIRST — if matched, skip metadata check and go to work/cover recovery
          const editionFileLink = await ingestDb.editionFile.findFirst({
            where: { fileAssetId: upsertedFileAsset.id },
          });

          if (editionFileLink !== null) {
            // Already linked to an edition — check work status and cover
            const edition = await ingestDb.edition.findUnique({
              where: { id: editionFileLink.editionId },
            });
            if (edition) {
              const work = await ingestDb.work.findUnique({
                where: { id: edition.workId },
              });
              if (work && work.enrichmentStatus === "STUB") {
                // Work stuck at STUB — for PDF/CBZ, look for OPF sidecar to trigger enrichment
                if (
                  upsertedFileAsset.mediaKind === MediaKind.PDF ||
                  upsertedFileAsset.mediaKind === MediaKind.CBZ
                ) {
                  const directory = path.dirname(upsertedFileAsset.absolutePath);
                  const sidecarSiblings = await ingestDb.fileAsset.findByDirectory({
                    directoryPath: directory,
                    mediaKinds: [MediaKind.SIDECAR],
                  });
                  const opfSibling = sidecarSiblings.find(
                    (fa) => getFileExtension(fa.absolutePath) === "opf",
                  );
                  if (opfSibling && opfSibling.fullHash !== null) {
                    logger.info({ fileAssetId: upsertedFileAsset.id, opfFileAssetId: opfSibling.id, workId: work.id, reason: "STUB work with OPF sibling" }, "Recovery: re-enqueueing OPF PARSE");
                    await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
                      fileAssetId: opfSibling.id,
                    });
                    enqueuedRecoveryJobs.push(upsertedFileAsset.id);
                  } else {
                    // No OPF sidecar — fall back to MATCH
                    logger.info({ fileAssetId: upsertedFileAsset.id, workId: work.id, reason: "work stuck at STUB (no OPF)" }, "Recovery: re-enqueueing MATCH");
                    await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
                      fileAssetId: upsertedFileAsset.id,
                    });
                    enqueuedRecoveryJobs.push(upsertedFileAsset.id);
                  }
                } else {
                  // EPUB/AUDIO — MATCH can use their own parsed metadata
                  logger.info({ fileAssetId: upsertedFileAsset.id, workId: work.id, reason: "work stuck at STUB" }, "Recovery: re-enqueueing MATCH");
                  await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
                    fileAssetId: upsertedFileAsset.id,
                  });
                  enqueuedRecoveryJobs.push(upsertedFileAsset.id);
                }
              }
              // Separately check for missing covers — runs for both STUB and ENRICHED works
              if (work && work.coverPath === null) {
                logger.info({ fileAssetId: upsertedFileAsset.id, workId: work.id, reason: "missing cover" }, "Recovery: re-enqueueing PROCESS_COVER");
                await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
                  workId: work.id,
                  fileAssetId: upsertedFileAsset.id,
                });
                if (!enqueuedRecoveryJobs.includes(upsertedFileAsset.id)) {
                  enqueuedRecoveryJobs.push(upsertedFileAsset.id);
                }
              }
            }
          } else {
            // Not linked to an edition — recover from earlier in the pipeline
            const parsedMeta = parseStoredMetadata(upsertedFileAsset.metadata);

            if (!parsedMeta || parsedMeta.status !== "parsed") {
              // Missing or failed metadata parse — only EPUB and AUDIO are parseable
              if (
                upsertedFileAsset.mediaKind === MediaKind.EPUB ||
                upsertedFileAsset.mediaKind === MediaKind.AUDIO
              ) {
                logger.info({ fileAssetId: upsertedFileAsset.id, reason: "missing or failed metadata" }, "Recovery: re-enqueueing PARSE");
                await enqueueJob(LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA, {
                  fileAssetId: upsertedFileAsset.id,
                });
                enqueuedRecoveryJobs.push(upsertedFileAsset.id);
              }
            } else {
              // Parsed but not matched to edition
              logger.info({ fileAssetId: upsertedFileAsset.id, reason: "parsed but unmatched" }, "Recovery: re-enqueueing MATCH");
              await enqueueJob(LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION, {
                fileAssetId: upsertedFileAsset.id,
              });
              enqueuedRecoveryJobs.push(upsertedFileAsset.id);
            }
          }
        }

        // Recovery for OPF sidecars: re-enqueue PARSE if hashed but not parsed
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
              // Ebook file — create stub per file
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
              createdStubWorkIds.push(stubWork.id);
              await enqueueJob(LIBRARY_JOB_NAMES.PROCESS_COVER, {
                workId: stubWork.id,
                fileAssetId: upsertedFileAsset.id,
              });
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
    const result = await matchFileAssetToEditionCore(input);
    if (!result.skipped) {
      await enqueueJob(LIBRARY_JOB_NAMES.DETECT_DUPLICATES, { fileAssetId: input.fileAssetId });
      await enqueueJob(LIBRARY_JOB_NAMES.MATCH_AUDIO, { fileAssetId: input.fileAssetId });
    }
    return result;
  }

  async function matchFileAssetToEditionCore(
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
        enrichedExistingWork: false,
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
                    language: storedMeta.normalized?.language ?? null,
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
        mergedIntoWorkId,
        skipped: false,
        workId: finalWorkId,
      };
    }

    const storedMetadata = parseStoredMetadata(fileAsset.metadata);
    const matchableMetadata = extractNormalizedMetadataForMatching(fileAsset);

    if (storedMetadata?.status !== "parsed" || matchableMetadata === undefined) {
      return {
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        enrichedExistingWork: false,
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
        enrichedExistingWork: false,
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
      enrichedExistingWork: false,
      enqueuedCoverJob: true,
      fileAssetId: fileAsset.id,
      skipped: false,
      workId,
    };
  }

  async function detectDuplicates(
    input: DetectDuplicatesInput,
  ): Promise<DetectDuplicatesResult> {
    return detectDuplicatesImpl(input, ingestDb);
  }

  async function matchAudio(
    input: MatchAudioInput,
  ): Promise<MatchAudioResult> {
    return matchAudioImpl(input, ingestDb);
  }

  return {
    detectDuplicates,
    hashFileAsset,
    matchAudio,
    matchFileAssetToEdition,
    parseFileAssetMetadata,
    scanLibraryRoot,
  };
}

const services = createIngestServices();

export const scanLibraryRoot = services.scanLibraryRoot;
export const hashFileAsset = services.hashFileAsset;
export const matchAudio = services.matchAudio;
export const matchFileAssetToEdition = services.matchFileAssetToEdition;
export const parseFileAssetMetadata = services.parseFileAssetMetadata;
export const detectDuplicates = services.detectDuplicates;
export { classifyMediaKind, deriveFormatFamily, getFileExtension, hashFileContents, isFileChanged, normalizeRelativePath, normalizeRootPath, walkRegularFiles };
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
