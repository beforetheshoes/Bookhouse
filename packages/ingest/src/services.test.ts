import type { Dirent, Stats } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AvailabilityStatus,
  ContributorRole,
  EditionFileRole,
  type EnrichmentStatus,
  FormatFamily,
  type FileAsset,
  MediaKind,
} from "@bookhouse/domain";
import { LIBRARY_JOB_NAMES } from "@bookhouse/shared";
import {
  canonicalizeBookTitle,
  canonicalizeContributorNames,
  createIngestServices,
  isFileChanged,
  type IngestDb,
  SCAN_PROGRESS_INTERVAL,
  walkRegularFiles,
} from "./index";

type ReaddirFn = (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
type LstatFn = (path: string) => Promise<Stats>;

interface TestFileAsset {
  absolutePath: string;
  availabilityStatus: AvailabilityStatus;
  basename: string;
  ctime: Date;
  extension: string | null;
  fullHash: string | null;
  id: string;
  lastSeenAt: Date | null;
  libraryRootId: string;
  mediaKind: MediaKind;
  metadata: FileAsset["metadata"];
  mtime: Date;
  partialHash: string | null;
  relativePath: string;
  sizeBytes: bigint;
}

interface TestDuplicateCandidate {
  confidence: number | null;
  id: string;
  leftEditionId: string | null;
  leftFileAssetId: string | null;
  reason: string;
  rightEditionId: string | null;
  rightFileAssetId: string | null;
  status: string;
}

interface TestState {
  contributors: Map<string, TestContributor>;
  contributorsByCanonical: Map<string, TestContributor>;
  duplicateCandidates: Map<string, TestDuplicateCandidate>;
  editionContributors: Map<string, TestEditionContributor>;
  editionFiles: Map<string, TestEditionFile>;
  editions: Map<string, TestEdition>;
  fileAssets: Map<string, TestFileAsset>;
  fileAssetsById: Map<string, TestFileAsset>;
  lastScannedAt: Date | null;
  rootPath: string;
  works: Map<string, TestWork>;
}

interface TestWork {
  description: string | null;
  enrichmentStatus: EnrichmentStatus;
  id: string;
  language: string | null;
  seriesId: string | null;
  seriesPosition: number | null;
  sortTitle: string | null;
  titleCanonical: string;
  titleDisplay: string;
}

interface TestEdition {
  asin: string | null;
  formatFamily: FormatFamily;
  id: string;
  isbn10: string | null;
  isbn13: string | null;
  publishedAt: Date | null;
  publisher: string | null;
  workId: string;
}

interface TestContributor {
  id: string;
  nameCanonical: string;
  nameDisplay: string;
}

interface TestEditionFile {
  editionId: string;
  fileAssetId: string;
  id: string;
  role: EditionFileRole;
}

interface TestEditionContributor {
  contributorId: string;
  editionId: string;
  id: string;
  role: ContributorRole;
}

function createEmptyState(rootPath = "/tmp/root"): TestState {
  return {
    contributors: new Map(),
    contributorsByCanonical: new Map(),
    duplicateCandidates: new Map(),
    editionContributors: new Map(),
    editionFiles: new Map(),
    editions: new Map(),
    fileAssets: new Map(),
    fileAssetsById: new Map(),
    lastScannedAt: null,
    rootPath,
    works: new Map(),
  };
}

function getEditionFileKey(editionId: string, fileAssetId: string): string {
  return `${editionId}:${fileAssetId}`;
}

function getEditionContributorKey(editionId: string, contributorId: string, role: ContributorRole): string {
  return `${editionId}:${contributorId}:${role}`;
}

function createTestDb(state: TestState): IngestDb {
  let contributorSequence = state.contributors.size;
  let duplicateCandidateSequence = state.duplicateCandidates.size;
  let editionContributorSequence = state.editionContributors.size;
  let editionFileSequence = state.editionFiles.size;
  let editionSequence = state.editions.size;
  let fileAssetSequence = state.fileAssetsById.size;
  let workSequence = state.works.size;

  return {
    libraryRoot: {
      async findUnique({ where }) {
        await Promise.resolve();
        if (where.id !== "root-1") {
          return null;
        }

        return {
          id: "root-1",
          lastScannedAt: state.lastScannedAt,
          path: state.rootPath,
        };
      },
      async update({ data, where }) {
        await Promise.resolve();
        if (where.id !== "root-1") {
          throw new Error(`Unexpected library root update: ${where.id}`);
        }

        state.lastScannedAt = data.lastScannedAt;
        return {
          id: "root-1",
          lastScannedAt: state.lastScannedAt,
          path: state.rootPath,
        };
      },
    },
    fileAsset: {
      async findByDirectory({ directoryPath, mediaKinds }) {
        await Promise.resolve();
        return [...state.fileAssets.values()].filter(
          (fa) => fa.absolutePath.startsWith(directoryPath + "/") && mediaKinds.includes(fa.mediaKind),
        );
      },
      async findMany({ where }) {
        await Promise.resolve();
        if ("libraryRootId" in where) {
          return [...state.fileAssets.values()].filter(
            (fileAsset) => fileAsset.libraryRootId === where.libraryRootId,
          );
        }
        // Hash-based query with NOT exclusion
        const hashWhere = where as { fullHash: string; NOT: { id: string } };
        return [...state.fileAssetsById.values()].filter(
          (fa) => fa.fullHash === hashWhere.fullHash && fa.id !== hashWhere.NOT.id,
        );
      },
      async findUnique({ where }) {
        await Promise.resolve();
        return state.fileAssetsById.get(where.id) ?? null;
      },
      async update({ data, where }) {
        await Promise.resolve();
        const existing = state.fileAssetsById.get(where.id);

        if (existing === undefined) {
          throw new Error(`Unknown file asset: ${where.id}`);
        }

        const updated = { ...existing, ...data };
        state.fileAssets.set(updated.absolutePath, updated);
        state.fileAssetsById.set(updated.id, updated);
        return updated;
      },
      async upsert({ create, update, where }) {
        await Promise.resolve();
        const existing = state.fileAssets.get(where.absolutePath);

        if (existing === undefined) {
          fileAssetSequence += 1;
          const created: TestFileAsset = {
            ...create,
            fullHash: null,
            id: `file-${String(fileAssetSequence)}`,
            metadata: create.metadata ?? null,
            partialHash: null,
          };
          state.fileAssets.set(created.absolutePath, created);
          state.fileAssetsById.set(created.id, created);
          return created;
        }

        const updated = { ...existing, ...update };
        state.fileAssets.set(updated.absolutePath, updated);
        state.fileAssetsById.set(updated.id, updated);
        return updated;
      },
    },
    work: {
      async create({ data }) {
        await Promise.resolve();
        workSequence += 1;
        const created: TestWork = {
          description: null,
          enrichmentStatus: "ENRICHED",
          id: `work-${String(workSequence)}`,
          language: null,
          seriesId: null,
          seriesPosition: null,
          ...data,
        };
        state.works.set(created.id, created);
        return created;
      },
      async delete({ where }) {
        await Promise.resolve();
        state.works.delete(where.id);
      },
      async findUnique({ where }) {
        await Promise.resolve();
        return state.works.get(where.id) ?? null;
      },
      async update({ data, where }) {
        await Promise.resolve();
        const existing = state.works.get(where.id);
        if (!existing) throw new Error(`Unknown work: ${where.id}`);
        const updated = { ...existing, ...data };
        state.works.set(updated.id, updated);
        return updated;
      },
      async findMany({ where }) {
        await Promise.resolve();
        let filtered: TestWork[];
        if ("titleCanonical" in where) {
          filtered = [...state.works.values()].filter((work) => work.titleCanonical === where.titleCanonical);
        } else {
          const notWhere = where as { NOT: { id: string } };
          filtered = [...state.works.values()].filter((work) => work.id !== notWhere.NOT.id);
        }
        return filtered
          .map((work) => ({
            ...work,
            editions: [...state.editions.values()]
              .filter((edition) => edition.workId === work.id)
              .map((edition) => ({
                ...edition,
                contributors: [...state.editionContributors.values()]
                  .filter((link) => link.editionId === edition.id)
                  .map((link) => ({
                    ...link,
                    contributor: state.contributors.get(link.contributorId) ?? (() => { throw new Error(`Contributor not found: ${link.contributorId}`); })(),
                  })),
              })),
          }));
      },
    },
    edition: {
      async create({ data }) {
        await Promise.resolve();
        editionSequence += 1;
        const created: TestEdition = {
          id: `edition-${String(editionSequence)}`,
          ...data,
        };
        state.editions.set(created.id, created);
        return created;
      },
      async findFirst({ where }) {
        await Promise.resolve();
        return [...state.editions.values()].find((edition) =>
          Object.entries(where).every(([key, value]) => edition[key as keyof TestEdition] === value),
        ) ?? null;
      },
      async findMany({ where }) {
        await Promise.resolve();
        const notId = where.NOT.id;
        return [...state.editions.values()].filter((edition) => {
          if (edition.id === notId) return false;
          return where.OR.some((clause: Record<string, string>) =>
            Object.entries(clause).every(([key, value]) => edition[key as keyof TestEdition] === value),
          );
        });
      },
      async findUnique({ where }) {
        await Promise.resolve();
        return state.editions.get(where.id) ?? null;
      },
      async update({ data, where }) {
        await Promise.resolve();
        const existing = state.editions.get(where.id);
        if (!existing) throw new Error(`Unknown edition: ${where.id}`);
        const updated = { ...existing, ...data };
        state.editions.set(updated.id, updated);
        return updated;
      },
    },
    series: {
      async upsert({ name }) {
        await Promise.resolve();
        return { id: `series-${name}`, name };
      },
    },
    editionFile: {
      async create({ data }) {
        await Promise.resolve();
        editionFileSequence += 1;
        const created: TestEditionFile = {
          id: `edition-file-${String(editionFileSequence)}`,
          ...data,
        };
        state.editionFiles.set(getEditionFileKey(created.editionId, created.fileAssetId), created);
        return created;
      },
      async findFirst({ where }) {
        await Promise.resolve();
        return [...state.editionFiles.values()].find((editionFile) =>
          (where.editionId === undefined || editionFile.editionId === where.editionId) &&
          (where.fileAssetId === undefined || editionFile.fileAssetId === where.fileAssetId),
        ) ?? null;
      },
    },
    contributor: {
      async create({ data }) {
        await Promise.resolve();
        contributorSequence += 1;
        const created: TestContributor = {
          id: `contributor-${String(contributorSequence)}`,
          ...data,
        };
        state.contributors.set(created.id, created);
        state.contributorsByCanonical.set(created.nameCanonical, created);
        return created;
      },
      async findMany({ where }) {
        await Promise.resolve();
        return where.nameCanonical.in
          .map((nameCanonical) => state.contributorsByCanonical.get(nameCanonical))
          .filter((contributor): contributor is TestContributor => contributor !== undefined);
      },
    },
    editionContributor: {
      async create({ data }) {
        await Promise.resolve();
        editionContributorSequence += 1;
        const created: TestEditionContributor = {
          id: `edition-contributor-${String(editionContributorSequence)}`,
          ...data,
        };
        state.editionContributors.set(
          getEditionContributorKey(created.editionId, created.contributorId, created.role),
          created,
        );
        return created;
      },
      async findFirst({ where }) {
        await Promise.resolve();
        return state.editionContributors.get(
          getEditionContributorKey(where.editionId, where.contributorId, where.role),
        ) ?? null;
      },
    },
    duplicateCandidate: {
      async create({ data }) {
        await Promise.resolve();
        duplicateCandidateSequence += 1;
        const created: TestDuplicateCandidate = {
          id: `dup-${String(duplicateCandidateSequence)}`,
          leftEditionId: data.leftEditionId ?? null,
          rightEditionId: data.rightEditionId ?? null,
          leftFileAssetId: data.leftFileAssetId ?? null,
          rightFileAssetId: data.rightFileAssetId ?? null,
          reason: data.reason,
          confidence: data.confidence,
          status: "PENDING",
        };
        state.duplicateCandidates.set(created.id, created);
        return created;
      },
      async findFirst({ where }) {
        await Promise.resolve();
        return [...state.duplicateCandidates.values()].find((dc) =>
          where.OR.some((clause: Record<string, string | undefined>) =>
            Object.entries(clause).every(([key, value]) =>
              value === undefined || dc[key as keyof TestDuplicateCandidate] === value,
            ),
          ),
        ) ?? null;
      },
    },
  };
}

function addFileAsset(state: TestState, overrides: Partial<TestFileAsset> = {}): TestFileAsset {
  const fileAsset: TestFileAsset = {
    absolutePath: "/tmp/root/book.epub",
    availabilityStatus: AvailabilityStatus.PRESENT,
    basename: "book.epub",
    ctime: new Date("2024-01-01T00:00:00.000Z"),
    extension: "epub",
    fullHash: "full",
    id: "file-1",
    lastSeenAt: null,
    libraryRootId: "root-1",
    mediaKind: MediaKind.EPUB,
    metadata: null,
    mtime: new Date("2024-01-01T00:00:00.000Z"),
    partialHash: "partial",
    relativePath: "book.epub",
    sizeBytes: 4n,
    ...overrides,
  };
  state.fileAssets.set(fileAsset.absolutePath, fileAsset);
  state.fileAssetsById.set(fileAsset.id, fileAsset);
  return fileAsset;
}

function addWork(state: TestState, overrides: Partial<TestWork> = {}): TestWork {
  const work: TestWork = {
    description: null,
    enrichmentStatus: "ENRICHED",
    id: "work-1",
    language: null,
    seriesId: null,
    seriesPosition: null,
    sortTitle: null,
    titleCanonical: "the fifth season",
    titleDisplay: "The Fifth Season",
    ...overrides,
  };
  state.works.set(work.id, work);
  return work;
}

function addEdition(state: TestState, overrides: Partial<TestEdition> = {}): TestEdition {
  const edition: TestEdition = {
    asin: null,
    formatFamily: FormatFamily.EBOOK,
    id: "edition-1",
    isbn10: null,
    isbn13: null,
    publishedAt: null,
    publisher: null,
    workId: "work-1",
    ...overrides,
  };
  state.editions.set(edition.id, edition);
  return edition;
}

function addContributor(state: TestState, overrides: Partial<TestContributor> = {}): TestContributor {
  const contributor: TestContributor = {
    id: "contributor-1",
    nameCanonical: "n k jemisin",
    nameDisplay: "N. K. Jemisin",
    ...overrides,
  };
  state.contributors.set(contributor.id, contributor);
  state.contributorsByCanonical.set(contributor.nameCanonical, contributor);
  return contributor;
}

function addEditionContributor(
  state: TestState,
  overrides: Partial<TestEditionContributor> = {},
): TestEditionContributor {
  const editionContributor: TestEditionContributor = {
    contributorId: "contributor-1",
    editionId: "edition-1",
    id: "edition-contributor-1",
    role: ContributorRole.AUTHOR,
    ...overrides,
  };
  state.editionContributors.set(
    getEditionContributorKey(
      editionContributor.editionId,
      editionContributor.contributorId,
      editionContributor.role,
    ),
    editionContributor,
  );
  return editionContributor;
}

function addEditionFile(state: TestState, overrides: Partial<TestEditionFile> = {}): TestEditionFile {
  const editionFile: TestEditionFile = {
    editionId: "edition-1",
    fileAssetId: "file-1",
    id: "edition-file-1",
    role: EditionFileRole.PRIMARY,
    ...overrides,
  };
  state.editionFiles.set(getEditionFileKey(editionFile.editionId, editionFile.fileAssetId), editionFile);
  return editionFile;
}

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
  );
  tempDirectories.length = 0;
});

describe("ingest services", () => {
  it("detects changed files based on size, mtime, or missing hashes", () => {
    const baseline = {
      absolutePath: "/tmp/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      fullHash: "full",
      id: "file-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "partial",
      sizeBytes: 10n,
    };

    expect(
      isFileChanged(undefined, { mtime: baseline.mtime, sizeBytes: baseline.sizeBytes }),
    ).toBe(true);
    expect(
      isFileChanged(baseline, { mtime: baseline.mtime, sizeBytes: baseline.sizeBytes }),
    ).toBe(false);
    expect(
      isFileChanged(baseline, { mtime: new Date("2024-01-02T00:00:00.000Z"), sizeBytes: 10n }),
    ).toBe(true);
    expect(
      isFileChanged({ ...baseline, partialHash: null }, { mtime: baseline.mtime, sizeBytes: 10n }),
    ).toBe(true);
    expect(
      isFileChanged({ ...baseline, fullHash: null }, { mtime: baseline.mtime, sizeBytes: 10n }),
    ).toBe(true);
    expect(
      isFileChanged(baseline, { mtime: baseline.mtime, sizeBytes: 11n }),
    ).toBe(true);
  });

  it("walks only regular files and skips symlinks or unreadable entries", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-walk-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "nested"));
    await writeFile(path.join(directory, "nested", "book.epub"), "epub");
    await writeFile(path.join(directory, "cover.jpg"), "cover");
    await symlink(path.join(directory, "nested", "book.epub"), path.join(directory, "book-link.epub"));

    const files = await walkRegularFiles(
      directory,
      (async (dirPath, options) => {
        const { readdir } = await import("node:fs/promises");
        return readdir(dirPath, options);
      }) as ReaddirFn,
      (async (entryPath) => {
        const { lstat } = await import("node:fs/promises");
        return lstat(entryPath);
      }) as LstatFn,
    );

    expect(files).toEqual([
      path.join(directory, "cover.jpg"),
      path.join(directory, "nested", "book.epub"),
    ]);
  });

  it("continues when a directory cannot be listed", async () => {
    const files = await walkRegularFiles(
      "/tmp/unreadable-root",
      (() => Promise.reject(new Error("permission denied"))) as ReaddirFn,
      (() => Promise.reject(new Error("should not be called"))) as LstatFn,
    );

    expect(files).toEqual([]);
  });

  it("falls back to lstat for ambiguous directory entries", async () => {
    const files = await walkRegularFiles(
      "/tmp/fallback-root",
      (async (dirPath) => {
        await Promise.resolve();
        if (dirPath === path.resolve("/tmp/fallback-root")) {
          return [
            {
              isDirectory: () => false,
              isFile: () => false,
              isSymbolicLink: () => false,
              name: "nested",
            },
            {
              isDirectory: () => false,
              isFile: () => false,
              isSymbolicLink: () => false,
              name: "book.epub",
            },
            {
              isDirectory: () => false,
              isFile: () => false,
              isSymbolicLink: () => false,
              name: "broken",
            },
            {
              isDirectory: () => false,
              isFile: () => false,
              isSymbolicLink: () => false,
              name: "linked.epub",
            },
            {
              isDirectory: () => false,
              isFile: () => false,
              isSymbolicLink: () => false,
              name: "unknown.bin",
            },
          ] as never;
        }

        if (dirPath === path.resolve("/tmp/fallback-root/nested")) {
          return [
            {
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
              name: "inside.pdf",
            },
          ] as never;
        }

        return [] as never;
      }) as ReaddirFn,
      (async (entryPath) => {
        await Promise.resolve();
        const normalized = path.resolve(entryPath);

        if (normalized.endsWith("/nested")) {
          return {
            isDirectory: () => true,
            isFile: () => false,
            isSymbolicLink: () => false,
          } as never;
        }

        if (normalized.endsWith("/book.epub")) {
          return {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
          } as never;
        }

        if (normalized.endsWith("/linked.epub")) {
          return {
            isDirectory: () => false,
            isFile: () => false,
            isSymbolicLink: () => true,
          } as never;
        }

        if (normalized.endsWith("/unknown.bin")) {
          return {
            isDirectory: () => false,
            isFile: () => false,
            isSymbolicLink: () => false,
          } as never;
        }

        throw new Error("broken entry");
      }) as LstatFn,
    );

    expect(files).toEqual([
      path.resolve("/tmp/fallback-root/book.epub"),
      path.resolve("/tmp/fallback-root/nested/inside.pdf"),
    ]);
  });

  it("scans a root, upserts discovered files, enqueues changed assets, and marks missing files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-scan-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "author"));
    await writeFile(path.join(directory, "author", "book.epub"), "first");
    await writeFile(path.join(directory, "author", "cover.jpg"), "cover");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: string; payload: { fileAssetId: string } }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({
          jobName,
          payload: payload as { fileAssetId: string },
        });
        return Promise.resolve(undefined);
      },
    });
    const firstScanAt = new Date("2025-01-01T00:00:00.000Z");
    const firstScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: firstScanAt,
    });

    expect(firstScan.discoveredPaths).toEqual([
      path.join(directory, "author", "book.epub"),
      path.join(directory, "author", "cover.jpg"),
    ]);
    expect(firstScan.enqueuedHashJobs).toHaveLength(2);
    expect(firstScan.missingFileAssetIds).toEqual([]);
    expect(firstScan.scannedFileAssetIds).toHaveLength(2);
    const bookStubWork = [...state.works.values()].at(0);
    expect(bookStubWork).toBeDefined();
    expect(enqueuedJobs).toEqual([
      {
        jobName: LIBRARY_JOB_NAMES.HASH_FILE_ASSET,
        payload: { fileAssetId: "file-1" },
      },
      {
        jobName: LIBRARY_JOB_NAMES.PROCESS_COVER,
        payload: { workId: bookStubWork?.id, fileAssetId: "file-1" },
      },
      {
        jobName: LIBRARY_JOB_NAMES.HASH_FILE_ASSET,
        payload: { fileAssetId: "file-2" },
      },
    ]);
    expect(state.lastScannedAt).toEqual(firstScanAt);

    const bookAsset = state.fileAssets.get(path.join(directory, "author", "book.epub"));
    const coverAsset = state.fileAssets.get(path.join(directory, "author", "cover.jpg"));

    expect(bookAsset).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      relativePath: path.join("author", "book.epub"),
    });
    expect(coverAsset).toMatchObject({
      mediaKind: MediaKind.COVER,
    });

    enqueuedJobs.length = 0;
    const secondScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:05:00.000Z"),
    });

    expect(secondScan.enqueuedHashJobs).toEqual([
      "file-1",
      "file-2",
    ]);

    const bookFileAsset = state.fileAssets.get(path.join(directory, "author", "book.epub"));
    const coverFileAsset = state.fileAssets.get(path.join(directory, "author", "cover.jpg"));
    if (bookFileAsset) { bookFileAsset.partialHash = "partial"; bookFileAsset.fullHash = "full"; }
    if (coverFileAsset) { coverFileAsset.partialHash = "partial"; coverFileAsset.fullHash = "full"; }

    enqueuedJobs.length = 0;
    const thirdScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(thirdScan.enqueuedHashJobs).toEqual([]);

    await writeFile(path.join(directory, "author", "book.epub"), "second-version");
    const nextTimestamp = new Date("2025-01-01T00:20:00.000Z");
    await utimes(path.join(directory, "author", "book.epub"), nextTimestamp, nextTimestamp);

    const fourthScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:30:00.000Z"),
    });

    expect(fourthScan.enqueuedHashJobs).toEqual(["file-1"]);

    await rm(path.join(directory, "author", "cover.jpg"));

    const fifthScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:40:00.000Z"),
    });

    expect(fifthScan.missingFileAssetIds).toEqual(["file-2"]);
    expect(state.fileAssets.get(path.join(directory, "author", "cover.jpg"))?.availabilityStatus).toBe(
      AvailabilityStatus.MISSING,
    );
  });

  it("skips entries that disappear during scanning", async () => {
    const listDirectory = vi.fn(() => Promise.resolve([
      {
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        name: "gone.epub",
      },
    ]));
    const readStats = vi.fn(async () => {
      await Promise.resolve();
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });
    const services = createIngestServices({
      db: createTestDb(createEmptyState("/tmp/root")),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory: listDirectory as never,
      readStats: readStats as never,
    });

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.discoveredPaths).toEqual([path.resolve("/tmp/root/gone.epub")]);
    expect(result.scannedFileAssetIds).toEqual([]);
  });

  it("calls reportProgress with totalFiles after discovery, processedFiles during loop, and final counts on completion", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-progress-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "author"));
    await writeFile(path.join(directory, "author", "book1.epub"), "a");
    await writeFile(path.join(directory, "author", "book2.epub"), "b");
    await writeFile(path.join(directory, "author", "book3.epub"), "c");

    const state = createEmptyState(directory);
    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await services.scanLibraryRoot({
      libraryRootId: "root-1",
      reportProgress,
    });

    // First call: totalFiles after discovery
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ totalFiles: 3 }),
    );
    // Last call: final processedFiles and errorCount
    const allCalls = reportProgress.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(allCalls.length).toBeGreaterThan(0);
    const lastProgressCall = allCalls[allCalls.length - 1] as [Record<string, unknown>];
    expect(lastProgressCall[0]).toMatchObject({ processedFiles: 3, errorCount: 0 });
  });

  it("does not call reportProgress when callback is not provided", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-noprogress-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "author"));
    await writeFile(path.join(directory, "author", "book.epub"), "a");

    const state = createEmptyState(directory);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    // Should not throw even without reportProgress
    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    expect(result.scannedFileAssetIds).toHaveLength(1);
  });

  it("calls reportProgress at batch intervals for normal files", async () => {
    const state = createEmptyState("/tmp/root");
    const count = SCAN_PROGRESS_INTERVAL;
    const entries = Array.from({ length: count }, (_, i) => ({
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      name: `book${String(i).padStart(3, "0")}.epub`,
    }));

    const listDirectory = (() => Promise.resolve(entries as never)) as ReaddirFn;
    const readStats = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        ctime: new Date("2024-01-01T00:00:00.000Z"),
        mtime: new Date("2024-01-01T00:00:00.000Z"),
        size: 100,
      } as never),
    ) as unknown as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1", reportProgress });

    // Should have batch call at processedFiles === SCAN_PROGRESS_INTERVAL
    const batchCall = (reportProgress.mock.calls as unknown as Array<[Record<string, unknown>]>).find(
      (call) => call[0].processedFiles === count,
    );
    expect(batchCall).toBeDefined();
  });

  it("calls reportProgress at batch intervals for stat errors", async () => {
    const state = createEmptyState("/tmp/root");
    const count = SCAN_PROGRESS_INTERVAL;
    const entries = Array.from({ length: count }, (_, i) => ({
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      name: `bad${String(i).padStart(3, "0")}.epub`,
    }));

    const listDirectory = (() => Promise.resolve(entries as never)) as ReaddirFn;
    const readStats = vi.fn(() => Promise.reject(new Error("gone"))) as unknown as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1", reportProgress });

    const batchCall = (reportProgress.mock.calls as unknown as Array<[Record<string, unknown>]>).find(
      (call) => call[0].processedFiles === count,
    );
    expect(batchCall).toBeDefined();
    expect(batchCall?.[0].errorCount).toBe(count);
  });

  it("calls reportProgress at batch intervals for non-file entries", async () => {
    const state = createEmptyState("/tmp/root");
    const count = SCAN_PROGRESS_INTERVAL;
    const entries = Array.from({ length: count }, (_, i) => ({
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
      name: `link${String(i).padStart(3, "0")}.epub`,
    }));

    const listDirectory = (() => Promise.resolve(entries as never)) as ReaddirFn;
    // readStats returns symlink so scanLibraryRoot skips via non-file branch
    const readStats = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => true,
      } as never),
    ) as unknown as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1", reportProgress });

    const batchCall = (reportProgress.mock.calls as unknown as Array<[Record<string, unknown>]>).find(
      (call) => call[0].processedFiles === count,
    );
    expect(batchCall).toBeDefined();
  });

  it("reports errorCount for files that fail stat during processing", async () => {
    const state = createEmptyState("/tmp/root");
    const listDirectory = (() =>
      Promise.resolve([
        { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false, name: "good.epub" },
        { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false, name: "bad.epub" },
      ] as never)) as ReaddirFn;

    // walkRegularFiles uses Dirent.isFile() directly, so readStats is only called
    // during the scan loop phase (not during walk discovery)
    const readStats = vi.fn((p: string) => {
      const normalized = path.normalize(p);
      if (normalized.endsWith("/good.epub")) {
        return Promise.resolve({
          isDirectory: () => false,
          isFile: () => true,
          isSymbolicLink: () => false,
          ctime: new Date("2024-01-01T00:00:00.000Z"),
          mtime: new Date("2024-01-01T00:00:00.000Z"),
          size: 100,
        } as never);
      }
      // bad.epub fails during scan loop stat
      return Promise.reject(new Error("disk error"));
    }) as unknown as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({
      libraryRootId: "root-1",
      reportProgress,
    });

    const calls = reportProgress.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1] as [Record<string, unknown>];
    expect(lastCall[0]).toMatchObject({ processedFiles: 2, errorCount: 1 });
  });

  it("creates stub works for new ebook files during scan", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-stub-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "author"));
    await writeFile(path.join(directory, "author", "My Great Book.epub"), "epub-content");
    await writeFile(path.join(directory, "author", "Another Book.pdf"), "pdf-content");

    const state = createEmptyState(directory);
    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    expect(result.createdStubWorkIds).toHaveLength(2);

    // Check stub works were created
    const works = [...state.works.values()];
    expect(works).toHaveLength(2);
    const workTitles = works.map((w) => w.titleDisplay).sort();
    expect(workTitles).toEqual(["Another Book", "My Great Book"]);
    for (const work of works) {
      expect(work.enrichmentStatus).toBe("STUB");
    }

    // Check editions were created
    const editions = [...state.editions.values()];
    expect(editions).toHaveLength(2);
    expect(editions[0]).toMatchObject({ formatFamily: FormatFamily.EBOOK });
    expect(editions[1]).toMatchObject({ formatFamily: FormatFamily.EBOOK });

    // Check edition files were linked
    const editionFiles = [...state.editionFiles.values()];
    expect(editionFiles).toHaveLength(2);

    // PROCESS_COVER should be enqueued immediately for each stub
    const allCalls = enqueueMock.mock.calls as unknown as [string, { workId: string; fileAssetId: string }][];
    const coverCalls = allCalls.filter(([name]) => name === LIBRARY_JOB_NAMES.PROCESS_COVER);
    expect(coverCalls).toHaveLength(2);
    for (const work of works) {
      const fileAsset = [...state.fileAssetsById.values()].find((fa) =>
        [...state.editionFiles.values()].some(
          (ef) =>
            ef.fileAssetId === fa.id &&
            [...state.editions.values()].find((e) => e.id === ef.editionId)?.workId === work.id,
        ),
      );
      expect(
        coverCalls.some(([, payload]) => payload.workId === work.id && payload.fileAssetId === fileAsset?.id),
      ).toBe(true);
    }
  });

  it("creates one stub per audiobook directory during scan", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-stub-audio-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "Author", "Book Title"), { recursive: true });
    await writeFile(path.join(directory, "Author", "Book Title", "01-chapter.mp3"), "audio1");
    await writeFile(path.join(directory, "Author", "Book Title", "02-chapter.mp3"), "audio2");

    const state = createEmptyState(directory);
    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    // Only one stub work for the directory, not per track
    expect(result.createdStubWorkIds).toHaveLength(1);
    const works = [...state.works.values()];
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({
      enrichmentStatus: "STUB",
      titleDisplay: "Book Title",
    });

    // One edition with AUDIOBOOK format family
    const editions = [...state.editions.values()];
    expect(editions).toHaveLength(1);
    expect(editions[0]).toMatchObject({ formatFamily: FormatFamily.AUDIOBOOK });

    // Both audio tracks linked to the same edition
    const editionFiles = [...state.editionFiles.values()];
    expect(editionFiles).toHaveLength(2);
    expect(editionFiles[0]?.editionId).toBe(editionFiles[1]?.editionId);

    // PROCESS_COVER should be enqueued once for the stub (using the first track's fileAssetId)
    const allAudioCalls = enqueueMock.mock.calls as unknown as [string, { workId: string; fileAssetId: string }][];
    const coverCalls = allAudioCalls.filter(([name]) => name === LIBRARY_JOB_NAMES.PROCESS_COVER);
    expect(coverCalls).toHaveLength(1);
    const stubWork = works.at(0);
    expect(stubWork).toBeDefined();
    expect(coverCalls.at(0)?.[1]).toMatchObject({ workId: stubWork?.id });
  });

  it("skips stubs for COVER, SIDECAR, and OTHER media kinds during scan", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-stub-skip-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "cover.jpg"), "image");
    await writeFile(path.join(directory, "metadata.opf"), "xml");
    await writeFile(path.join(directory, "readme.bin"), "binary");

    const state = createEmptyState(directory);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    expect(result.createdStubWorkIds).toHaveLength(0);
    expect(state.works.size).toBe(0);
  });

  it("skips stubs for files that already have an edition file link", async () => {
    const state = createEmptyState("/tmp/root");
    // Pre-populate a work/edition/edition-file that references a file-asset-id
    // that will be created during scan — simulates a file whose EditionFile was
    // created out-of-band before the scan discovers it as new
    const existingWork = addWork(state, { id: "existing-work-1" });
    addEdition(state, { id: "existing-edition-1", workId: existingWork.id });
    addEditionFile(state, {
      editionId: "existing-edition-1",
      fileAssetId: "file-1", // will match the first upserted file asset
    });

    const listDirectory = (() =>
      Promise.resolve([
        { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false, name: "book.epub" },
      ] as never)) as ReaddirFn;
    const readStats = vi.fn(() =>
      Promise.resolve({
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        ctime: new Date("2024-01-01T00:00:00.000Z"),
        mtime: new Date("2024-01-01T00:00:00.000Z"),
        size: 100,
      } as never),
    ) as unknown as LstatFn;

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    // File already had an edition file link, so no stub created
    expect(result.createdStubWorkIds).toHaveLength(0);
    // Only the pre-existing work
    expect(state.works.size).toBe(1);
  });

  it("skips stubs for existing unchanged files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-stub-unchanged-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub-content");

    const state = createEmptyState(directory);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    // First scan
    const firstResult = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    expect(firstResult.createdStubWorkIds).toHaveLength(1);

    // Second scan — file hasn't changed, no new stubs
    const secondResult = await services.scanLibraryRoot({
      libraryRootId: "root-1",
    });

    expect(secondResult.createdStubWorkIds).toHaveLength(0);
    // Still only 1 work total
    expect(state.works.size).toBe(1);
  });

  it("throws when the library root does not exist", async () => {
    const services = createIngestServices({
      db: createTestDb(createEmptyState("/tmp/root")),
    });

    await expect(
      services.scanLibraryRoot({ libraryRootId: "missing-root" }),
    ).rejects.toThrow('Library root "missing-root" was not found');
  });

  it("creates services with default runtime dependencies", () => {
    const services = createIngestServices();

    expect(typeof services.hashFileAsset).toBe("function");
    expect(typeof services.matchFileAssetToEdition).toBe("function");
    expect(typeof services.parseFileAssetMetadata).toBe("function");
    expect(typeof services.scanLibraryRoot).toBe("function");
  });

  it("skips paths that are no longer regular files during the scan upsert pass", async () => {
    const services = createIngestServices({
      db: createTestDb(createEmptyState("/tmp/root")),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory: (() =>
        Promise.resolve([
          {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            name: "ghost.epub",
          },
        ] as never)) as ReaddirFn,
      readStats: (() =>
        Promise.resolve({
          isFile: () => false,
          isSymbolicLink: () => true,
        } as never)) as LstatFn,
    });

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.scannedFileAssetIds).toEqual([]);
    expect(result.enqueuedHashJobs).toEqual([]);
  });

  it("hashes file assets and marks missing files without clearing prior hashes", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "existing-full",
      id: "file-1",
      lastSeenAt: new Date("2024-01-01T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "existing-partial",
      relativePath: "book.epub",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "next-full",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "next-partial",
          sizeBytes: 12n,
        };
      }),
    });

    const hashed = await services.hashFileAsset({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T01:00:00.000Z"),
    });

    expect(hashed).toEqual({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      fullHash: "next-full",
      partialHash: "next-partial",
    });
    expect(state.fileAssetsById.get("file-1")).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fullHash: "next-full",
      partialHash: "next-partial",
      sizeBytes: 12n,
    });

    const missingServices = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }),
    });

    const missingResult = await missingServices.hashFileAsset({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T02:00:00.000Z"),
    });

    expect(missingResult).toEqual({
      availabilityStatus: AvailabilityStatus.MISSING,
      fileAssetId: "file-1",
    });
    expect(state.fileAssetsById.get("file-1")).toMatchObject({
      availabilityStatus: AvailabilityStatus.MISSING,
      fullHash: "next-full",
      partialHash: "next-partial",
    });
  });

  it("throws for unknown file assets and non-ENOENT hash errors", async () => {
    const state = createEmptyState("/tmp/root");
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await expect(
      services.hashFileAsset({ fileAssetId: "missing-file" }),
    ).rejects.toThrow('File asset "missing-file" was not found');

    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "book.epub",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);

    const hashError = new Error("read failed");
    const failingServices = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        throw hashError;
      }),
    });

    await expect(
      failingServices.hashFileAsset({ fileAssetId: "file-1" }),
    ).rejects.toBe(hashError);
  });

  it("enqueues metadata parsing after hashing EPUB assets", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "book.epub",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "next-full",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "next-partial",
          sizeBytes: 12n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("does not enqueue metadata parsing after hashing non-EPUB assets", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/cover.jpg",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "cover.jpg",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "jpg",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.COVER,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "cover.jpg",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "next-full",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "next-partial",
          sizeBytes: 12n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("parses EPUB metadata and persists normalized results", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseEpub: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: ["  N. K. Jemisin  ", "N. K. Jemisin"],
          identifiers: [
            { scheme: "ISBN-13", value: "978-0-316-49883-4" },
            { value: "B012345678" },
          ],
          title: "  The Fifth Season ",
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T03:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      normalized: {
        authors: ["N. K. Jemisin"],
        identifiers: {
          asin: "B012345678",
          isbn13: "9780316498834",
          unknown: [],
        },
        title: "The Fifth Season",
      },
      raw: {
        authors: ["  N. K. Jemisin  ", "N. K. Jemisin"],
      },
      source: "epub",
      status: "parsed",
      warnings: [],
    });
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      { fileAssetId: "file-1" },
    );
  });

  it("skips metadata parsing for non-EPUB assets", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/cover.jpg",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "cover.jpg",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "jpg",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.COVER,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "partial",
      relativePath: "cover.jpg",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const parseEpub = vi.fn();
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseEpub,
    });

    await expect(
      services.parseFileAssetMetadata({ fileAssetId: "file-1" }),
    ).resolves.toEqual({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: true,
    });
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("marks EPUB metadata as unparseable without failing the job", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "partial",
      relativePath: "book.epub",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseEpub: vi.fn(async () => {
        await Promise.resolve();
        throw new Error("bad epub");
      }),
    });

    const result = await services.parseFileAssetMetadata({ fileAssetId: "file-1" });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "epub",
      status: "unparseable",
      warnings: ["bad epub"],
    });
  });

  it("uses a fallback warning for non-Error EPUB parse failures", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "partial",
      relativePath: "book.epub",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseEpub: vi.fn().mockRejectedValueOnce("bad-value"),
    });

    await services.parseFileAssetMetadata({ fileAssetId: "file-1" });

    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      warnings: ["Unknown EPUB parsing error"],
    });
  });

  it("marks missing EPUBs during metadata parsing when the file disappears", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseEpub: vi.fn(async () => {
        await Promise.resolve();
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }),
    });

    await expect(
      services.parseFileAssetMetadata({ fileAssetId: "file-1" }),
    ).resolves.toEqual({
      availabilityStatus: AvailabilityStatus.MISSING,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.availabilityStatus).toBe(
      AvailabilityStatus.MISSING,
    );
  });

  it("skips matching for unknown assets, non-EPUB assets, and unusable metadata", async () => {
    const unknownServices = createIngestServices({
      db: createTestDb(createEmptyState("/tmp/root")),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await expect(
      unknownServices.matchFileAssetToEdition({ fileAssetId: "missing-file" }),
    ).resolves.toEqual({
      createdEdition: false,
      createdEditionFile: false,
      createdWork: false,
      enrichedExistingWork: false,
      enqueuedCoverJob: false,
      fileAssetId: "missing-file",
      skipped: true,
    });

    const nonEpubState = createEmptyState("/tmp/root");
    addFileAsset(nonEpubState, {
      absolutePath: "/tmp/root/cover.jpg",
      basename: "cover.jpg",
      extension: "jpg",
      mediaKind: MediaKind.COVER,
      relativePath: "cover.jpg",
    });
    const nonEpubServices = createIngestServices({
      db: createTestDb(nonEpubState),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await expect(
      nonEpubServices.matchFileAssetToEdition({ fileAssetId: "file-1" }),
    ).resolves.toMatchObject({
      fileAssetId: "file-1",
      skipped: true,
    });

    const invalidSourceState = createEmptyState("/tmp/root");
    addFileAsset(invalidSourceState, {
      metadata: {
        source: "pdf",
        status: "parsed",
      } as never,
    });
    const unparseableState = createEmptyState("/tmp/root");
    addFileAsset(unparseableState, {
      metadata: {
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "unparseable",
        warnings: ["bad epub"],
      },
    });
    const nullMetadataState = createEmptyState("/tmp/root");
    addFileAsset(nullMetadataState, {
      metadata: null,
    });
    const primitiveMetadataState = createEmptyState("/tmp/root");
    addFileAsset(primitiveMetadataState, {
      metadata: "bad-metadata" as never,
    });
    const missingTitleState = createEmptyState("/tmp/root");
    addFileAsset(missingTitleState, {
      metadata: {
        normalized: {
          authors: ["N. K. Jemisin"],
          identifiers: { unknown: [] },
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    const missingAuthorsState = createEmptyState("/tmp/root");
    addFileAsset(missingAuthorsState, {
      metadata: {
        normalized: {
          authors: [],
          identifiers: { unknown: [] },
          title: "The Fifth Season",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    const unmatchableCanonicalState = createEmptyState("/tmp/root");
    addFileAsset(unmatchableCanonicalState, {
      metadata: {
        normalized: {
          authors: ["!!!"],
          identifiers: { unknown: [] },
          title: "!!!",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });

    for (const state of [
      invalidSourceState,
      nullMetadataState,
      primitiveMetadataState,
      unparseableState,
      missingTitleState,
      missingAuthorsState,
      unmatchableCanonicalState,
    ]) {
      const services = createIngestServices({
        db: createTestDb(state),
        enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      });

      await expect(
        services.matchFileAssetToEdition({ fileAssetId: "file-1" }),
      ).resolves.toMatchObject({
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        fileAssetId: "file-1",
        skipped: true,
      });
    }
  });

  it("matches existing editions by exact identifiers and remains idempotent", async () => {
    const cases: Array<{
      field: "asin" | "isbn10" | "isbn13";
      value: string;
    }> = [
      { field: "isbn13", value: "9780316498834" },
      { field: "isbn10", value: "0316499015" },
      { field: "asin", value: "B012345678" },
    ];

    for (const testCase of cases) {
      const state = createEmptyState("/tmp/root");
      addFileAsset(state, {
        metadata: {
          normalized: {
            authors: ["N.K. Jemisin"],
            identifiers: {
              [testCase.field]: testCase.value,
              unknown: [],
            },
            title: "The Fifth Season",
          },
          parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
          parserVersion: 1,
          source: "epub",
          status: "parsed",
          warnings: [],
        } as FileAsset["metadata"],
      });
      addWork(state);
      addEdition(state, { [testCase.field]: testCase.value });
      const services = createIngestServices({
        db: createTestDb(state),
        enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      });

      const firstResult = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });
      const secondResult = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

      expect(firstResult).toEqual({
        createdEdition: false,
        createdEditionFile: true,
        createdWork: false,
        editionId: "edition-1",
        enrichedExistingWork: false,
        enqueuedCoverJob: true,
        fileAssetId: "file-1",
        skipped: false,
        workId: "work-1",
      });
      expect(secondResult).toEqual({
        createdEdition: false,
        createdEditionFile: false,
        createdWork: false,
        editionId: "edition-1",
        enrichedExistingWork: false,
        enqueuedCoverJob: true,
        fileAssetId: "file-1",
        skipped: false,
        workId: "work-1",
      });
      expect([...state.editionFiles.values()]).toHaveLength(1);
    }
  });

  it("creates a new edition under an existing work when title and authors match but identifiers differ", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      metadata: {
        normalized: {
          authors: ["N.K. Jemisin"],
          identifiers: {
            isbn13: "9780316498841",
            unknown: [],
          },
          title: " The, Fifth-Season! ",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    addWork(state, {
      titleCanonical: canonicalizeBookTitle("The Fifth Season") ?? "the fifth season",
    });
    addEdition(state, {
      isbn13: "9780316498834",
    });
    addContributor(state, {
      nameCanonical: canonicalizeContributorNames(["N. K. Jemisin"])[0] ?? "n k jemisin",
    });
    addEditionContributor(state);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result).toEqual({
      createdEdition: true,
      createdEditionFile: true,
      createdWork: false,
      editionId: "edition-2",
      enrichedExistingWork: false,
      enqueuedCoverJob: true,
      fileAssetId: "file-1",
      skipped: false,
      workId: "work-1",
    });
    expect([...state.editions.values()]).toHaveLength(2);
    expect(state.editions.get("edition-2")).toMatchObject({
      formatFamily: FormatFamily.EBOOK,
      isbn13: "9780316498841",
      workId: "work-1",
    });
    expect([...state.contributors.values()]).toHaveLength(1);
    expect([...state.editionContributors.values()]).toHaveLength(2);
  });

  it("creates a new work, edition, contributors, and file link when no match exists", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      metadata: {
        normalized: {
          authors: ["N. K. Jemisin", "N.K. Jemisin"],
          identifiers: {
            asin: "B012345678",
            isbn13: "9780316498834",
            unknown: [],
          },
          title: "The Fifth Season",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result).toEqual({
      createdEdition: true,
      createdEditionFile: true,
      createdWork: true,
      editionId: "edition-1",
      enrichedExistingWork: false,
      enqueuedCoverJob: true,
      fileAssetId: "file-1",
      skipped: false,
      workId: "work-1",
    });
    expect(state.works.get("work-1")).toEqual({
      description: null,
      enrichmentStatus: "ENRICHED",
      id: "work-1",
      language: null,
      seriesId: null,
      seriesPosition: null,
      sortTitle: null,
      titleCanonical: "the fifth season",
      titleDisplay: "The Fifth Season",
    });
    expect(state.editions.get("edition-1")).toMatchObject({
      asin: "B012345678",
      formatFamily: FormatFamily.EBOOK,
      isbn13: "9780316498834",
      workId: "work-1",
    });
    expect([...state.contributors.values()]).toEqual([
      {
        id: "contributor-1",
        nameCanonical: "n k jemisin",
        nameDisplay: "N. K. Jemisin",
      },
    ]);
    expect([...state.editionFiles.values()]).toHaveLength(1);
  });

  it("creates a work and edition from title and author when strong identifiers are missing", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      metadata: {
        normalized: {
          authors: ["N. K. Jemisin"],
          identifiers: { unknown: ["urn:uuid:test"] },
          title: "The Fifth Season",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await expect(
      services.matchFileAssetToEdition({ fileAssetId: "file-1" }),
    ).resolves.toMatchObject({
      createdEdition: true,
      createdWork: true,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.editions.get("edition-1")).toMatchObject({
      asin: null,
      isbn10: null,
      isbn13: null,
    });
  });

  it("returns the existing edition mapping when the file is already linked", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      metadata: {
        normalized: {
          authors: ["N. K. Jemisin"],
          identifiers: { isbn13: "9780316498834", unknown: [] },
          title: "The Fifth Season",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    addWork(state);
    addEdition(state, { isbn13: "9780316498834" });
    addEditionFile(state);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await expect(
      services.matchFileAssetToEdition({ fileAssetId: "file-1" }),
    ).resolves.toEqual({
      createdEdition: false,
      createdEditionFile: false,
      createdWork: false,
      editionId: "edition-1",
      enrichedExistingWork: false,
      enqueuedCoverJob: true,
      fileAssetId: "file-1",
      skipped: false,
      workId: "work-1",
    });
  });

  it("handles orphaned editionFile when edition no longer exists", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      metadata: {
        normalized: {
          authors: ["N. K. Jemisin"],
          identifiers: { isbn13: "9780316498834", unknown: [] },
          title: "The Fifth Season",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    // Add editionFile but NO edition — orphaned reference
    addEditionFile(state);

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
    });

    await expect(
      services.matchFileAssetToEdition({ fileAssetId: "file-1" }),
    ).resolves.toEqual({
      createdEdition: false,
      createdEditionFile: false,
      createdWork: false,
      editionId: undefined,
      enrichedExistingWork: false,
      enqueuedCoverJob: false,
      fileAssetId: "file-1",
      skipped: false,
      workId: undefined,
    });

    // Should NOT enqueue a cover job when edition is missing, only detect-duplicates
    expect(enqueueLibraryJob).toHaveBeenCalledTimes(1);
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.DETECT_DUPLICATES,
      { fileAssetId: "file-1" },
    );
  });

  it("enriches an existing stub work with parsed metadata", async () => {
    const state = createEmptyState("/tmp/root");
    const stubWork = addWork(state, {
      enrichmentStatus: "STUB",
      titleCanonical: "my great book",
      titleDisplay: "My Great Book",
    });
    const edition = addEdition(state, { workId: stubWork.id });
    addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      metadata: {
        source: "epub",
        status: "parsed",
        version: 1,
        normalized: {
          title: "The Fifth Season",
          authors: ["N. K. Jemisin"],
          identifiers: { isbn13: "9780316229296" },
        },
      },
    });
    addEditionFile(state, {
      editionId: edition.id,
      fileAssetId: "file-1",
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.enrichedExistingWork).toBe(true);
    expect(result.mergedIntoWorkId).toBeUndefined();
    expect(state.works.get("work-1")).toMatchObject({
      enrichmentStatus: "ENRICHED",
      titleCanonical: "the fifth season",
      titleDisplay: "The Fifth Season",
    });
    // Edition should have identifiers
    expect(state.editions.get("edition-1")).toMatchObject({
      isbn13: "9780316229296",
    });
    // Contributors should be created
    expect([...state.editionContributors.values()].length).toBeGreaterThan(0);
  });

  it("merges a stub work into an existing enriched work when title and authors match", async () => {
    const state = createEmptyState("/tmp/root");

    // Existing enriched work with contributor
    const enrichedWork = addWork(state, {
      id: "enriched-work",
      enrichmentStatus: "ENRICHED",
      titleCanonical: "the fifth season",
      titleDisplay: "The Fifth Season",
    });
    const enrichedEdition = addEdition(state, {
      id: "enriched-edition",
      workId: enrichedWork.id,
    });
    const author = addContributor(state, {
      id: "author-1",
      nameCanonical: "n k jemisin",
      nameDisplay: "N. K. Jemisin",
    });
    addEditionContributor(state, {
      editionId: enrichedEdition.id,
      contributorId: author.id,
      role: ContributorRole.AUTHOR,
    });

    // Stub work from scan
    const stubWork = addWork(state, {
      id: "stub-work",
      enrichmentStatus: "STUB",
      titleCanonical: "my great book",
      titleDisplay: "My Great Book",
    });
    const stubEdition = addEdition(state, {
      id: "stub-edition",
      workId: stubWork.id,
    });
    addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      metadata: {
        source: "epub",
        status: "parsed",
        version: 1,
        normalized: {
          title: "The Fifth Season",
          authors: ["N. K. Jemisin"],
          identifiers: {},
        },
      },
    });
    addEditionFile(state, {
      editionId: stubEdition.id,
      fileAssetId: "file-1",
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.enrichedExistingWork).toBe(true);
    expect(result.mergedIntoWorkId).toBe("enriched-work");
    // Stub work should be deleted
    expect(state.works.get("stub-work")).toBeUndefined();
    // Edition should be re-linked to the enriched work
    expect(state.editions.get("stub-edition")?.workId).toBe("enriched-work");
  });

  it("merges a stub work when ISBN matches an existing edition on a different work", async () => {
    const state = createEmptyState("/tmp/root");

    // Existing work with edition that has matching ISBN
    const existingWork = addWork(state, {
      id: "existing-work",
      enrichmentStatus: "ENRICHED",
      titleCanonical: "the fifth season",
      titleDisplay: "The Fifth Season",
    });
    addEdition(state, {
      id: "existing-edition",
      workId: existingWork.id,
      isbn13: "9780316229296",
    });

    // Stub work from scan
    const stubWork = addWork(state, {
      id: "stub-work",
      enrichmentStatus: "STUB",
      titleCanonical: "my great book",
      titleDisplay: "My Great Book",
    });
    const stubEdition = addEdition(state, {
      id: "stub-edition",
      workId: stubWork.id,
    });
    addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      metadata: {
        source: "epub",
        status: "parsed",
        version: 1,
        normalized: {
          title: "The Fifth Season",
          authors: ["N. K. Jemisin"],
          identifiers: { isbn13: "9780316229296" },
        },
      },
    });
    addEditionFile(state, {
      editionId: stubEdition.id,
      fileAssetId: "file-1",
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.enrichedExistingWork).toBe(true);
    expect(result.mergedIntoWorkId).toBe("existing-work");
    // Stub work deleted
    expect(state.works.get("stub-work")).toBeUndefined();
    // Edition re-linked
    expect(state.editions.get("stub-edition")?.workId).toBe("existing-work");
  });

  it("enriches a stub work in place when its canonical title matches metadata and no other work matches", async () => {
    const state = createEmptyState("/tmp/root");
    const stubWork = addWork(state, {
      enrichmentStatus: "STUB",
      titleCanonical: "the fifth season",
      titleDisplay: "the fifth season",
    });
    const edition = addEdition(state, { workId: stubWork.id });
    addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      metadata: {
        source: "epub",
        status: "parsed",
        version: 1,
        normalized: {
          title: "The Fifth Season",
          authors: ["N. K. Jemisin"],
          identifiers: { asin: "B00H25FCSQ" },
        },
      },
    });
    addEditionFile(state, {
      editionId: edition.id,
      fileAssetId: "file-1",
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.enrichedExistingWork).toBe(true);
    expect(result.mergedIntoWorkId).toBeUndefined();
    expect(state.works.get("work-1")).toMatchObject({
      enrichmentStatus: "ENRICHED",
      titleDisplay: "The Fifth Season",
    });
    expect(state.editions.get("edition-1")).toMatchObject({
      asin: "B00H25FCSQ",
      isbn13: null,
      isbn10: null,
    });
  });

  it("skips enrichment of a stub work when file has no parsed metadata", async () => {
    const state = createEmptyState("/tmp/root");
    const stubWork = addWork(state, {
      enrichmentStatus: "STUB",
      titleCanonical: "my great book",
      titleDisplay: "My Great Book",
    });
    const edition = addEdition(state, { workId: stubWork.id });
    addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      metadata: null,
    });
    addEditionFile(state, {
      editionId: edition.id,
      fileAssetId: "file-1",
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.enrichedExistingWork).toBe(false);
    expect(state.works.get("work-1")?.enrichmentStatus).toBe("STUB");
  });

  it("does not re-enrich already enriched works on the existing edition path", async () => {
    const state = createEmptyState("/tmp/root");
    const work = addWork(state, {
      enrichmentStatus: "ENRICHED",
      titleCanonical: "the fifth season",
      titleDisplay: "The Fifth Season",
    });
    const edition = addEdition(state, { workId: work.id });
    addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      basename: "book.epub",
      extension: "epub",
      mediaKind: MediaKind.EPUB,
      metadata: {
        source: "epub",
        status: "parsed",
        version: 1,
        normalized: {
          title: "Some Other Title",
          authors: ["Different Author"],
          identifiers: { isbn13: "9781234567890" },
        },
      },
    });
    addEditionFile(state, {
      editionId: edition.id,
      fileAssetId: "file-1",
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.enrichedExistingWork).toBe(false);
    // Work title unchanged
    expect(state.works.get("work-1")?.titleDisplay).toBe("The Fifth Season");
  });

  it("throws when metadata parsing is requested for an unknown file asset", async () => {
    const services = createIngestServices({
      db: createTestDb(createEmptyState("/tmp/root")),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    await expect(
      services.parseFileAssetMetadata({ fileAssetId: "missing-file" }),
    ).rejects.toThrow('File asset "missing-file" was not found');
  });

  it("enqueues metadata parsing after hashing an OPF sidecar", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "phash",
          sizeBytes: 2n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("does not enqueue metadata parsing for non-opf SIDECAR files", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/cover.jpg",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "cover.jpg",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "jpg",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "Author/Book/cover.jpg",
      sizeBytes: 2n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "phash",
          sizeBytes: 2n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      expect.anything(),
    );
  });

  it("parses OPF sidecar metadata and stores normalized result without sibling enrichment", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [{ name: "Patrick Rothfuss", fileAs: "Rothfuss, Patrick", role: "aut" }],
          identifiers: [{ scheme: "ISBN", value: "9780756404079" }],
          title: "The Name of the Wind",
          description: "<p>A story.</p>",
          subjects: ["Fantasy"],
          publisher: "DAW Books",
          date: "2007-03-27",
          language: "en",
          series: { name: "The Kingkiller Chronicle", index: 1 },
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      normalized: {
        authors: ["Patrick Rothfuss"],
        title: "The Name of the Wind",
        publisher: "DAW Books",
      },
      source: "opf-sidecar",
      status: "parsed",
    });
  });

  it("enriches sibling edition and work from OPF sidecar folder-proximity", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);

    addWork(state, { id: "work-1", titleDisplay: "The Name of the Wind", titleCanonical: "the name of the wind" });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-epub" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          publisher: "DAW Books",
          date: "2007-03-27",
          description: "A story.",
          language: "en",
          series: { name: "The Kingkiller Chronicle", index: 1 },
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.editions.get("edition-1")).toMatchObject({
      publisher: "DAW Books",
    });
    expect(state.editions.get("edition-1")?.publishedAt).toBeInstanceOf(Date);
    expect(state.works.get("work-1")).toMatchObject({
      description: "A story.",
      language: "en",
      seriesId: "series-The Kingkiller Chronicle",
      seriesPosition: 1,
    });
  });

  it("sets seriesPosition to null when series has no index", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);

    addWork(state, { id: "work-1", titleDisplay: "The Name of the Wind", titleCanonical: "the name of the wind" });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-epub" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          publisher: "DAW Books",
          date: "2007-03-27",
          description: "A story.",
          language: "en",
          series: { name: "The Kingkiller Chronicle" },
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.works.get("work-1")).toMatchObject({
      seriesId: "series-The Kingkiller Chronicle",
      seriesPosition: null,
    });
  });

  it("skips OPF enrichment when edition and work already have values", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);

    addWork(state, {
      id: "work-1",
      titleDisplay: "The Name of the Wind",
      titleCanonical: "the name of the wind",
      description: "Existing description",
      language: "fr",
      seriesId: "existing-series",
    });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: "Existing Publisher", publishedAt: new Date("2000-01-01") });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-epub" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          publisher: "New Publisher",
          date: "2007-03-27",
          description: "New description",
          language: "en",
          series: { name: "New Series", index: 1 },
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.editions.get("edition-1")).toMatchObject({ publisher: "Existing Publisher" });
    expect(state.works.get("work-1")).toMatchObject({
      description: "Existing description",
      language: "fr",
      seriesId: "existing-series",
    });
  });

  it("skips OPF sibling enrichment when sibling has no editionFile", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);
    // No editionFile added for epubAsset

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          publisher: "DAW Books",
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    expect(result.availabilityStatus).toBe(AvailabilityStatus.PRESENT);
  });

  it("skips OPF sibling enrichment when sibling editionFile has no matching edition", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);
    addEditionFile(state, { editionId: "missing-edition", fileAssetId: "file-epub" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          publisher: "DAW Books",
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    expect(result.availabilityStatus).toBe(AvailabilityStatus.PRESENT);
  });

  it("handles invalid date in OPF sidecar without writing publishedAt", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);

    addWork(state, { id: "work-1", titleDisplay: "The Name of the Wind", titleCanonical: "the name of the wind" });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-epub" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          date: "not-a-date",
          publisher: "DAW Books",
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.editions.get("edition-1")).toMatchObject({
      publisher: "DAW Books",
      publishedAt: null,
    });
  });

  it("marks OPF sidecar as missing when the file disappears during parsing", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        const error = new Error("no such file") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      availabilityStatus: AvailabilityStatus.MISSING,
      fileAssetId: "file-opf",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-opf")?.availabilityStatus).toBe(AvailabilityStatus.MISSING);
  });

  it("marks OPF sidecar as unparseable on non-ENOENT parse errors", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        throw new Error("OPF document did not contain metadata");
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-opf",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-opf")?.metadata).toMatchObject({
      source: "opf-sidecar",
      status: "unparseable",
      warnings: ["OPF document did not contain metadata"],
    });
  });

  it("uses fallback warning for non-Error OPF parse failures", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn().mockRejectedValueOnce("bad-value"),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.fileAssetsById.get("file-opf")?.metadata).toMatchObject({
      warnings: ["Unknown OPF parsing error"],
    });
  });

  it("skips OPF work enrichment when work is not found for an edition", async () => {
    const state = createEmptyState("/tmp/root");
    const opfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.opf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.opf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "opf",
      fullHash: "hash",
      id: "file-opf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.opf",
      sizeBytes: 2n,
    };
    state.fileAssets.set(opfAsset.absolutePath, opfAsset);
    state.fileAssetsById.set(opfAsset.id, opfAsset);

    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "epub-hash",
      id: "file-epub",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "epub-phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);

    // Edition references a workId that doesn't exist in state
    addEdition(state, { id: "edition-1", workId: "missing-work", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-epub" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          publisher: "DAW Books",
          description: "A story.",
          language: "en",
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    expect(state.editions.get("edition-1")).toMatchObject({ publisher: "DAW Books" });
  });

  // ── Audiobook tests ──────────────────────────────────────────────────

  it("enqueues metadata parsing after hashing AUDIO files", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 4n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "phash",
          sizeBytes: 4n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("enqueues metadata parsing after hashing a metadata.json sidecar", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "phash",
          sizeBytes: 2n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("does not enqueue metadata parsing for non-metadata.json SIDECAR files", async () => {
    const state = createEmptyState("/tmp/root");
    const existing: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/notes.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "notes.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: null,
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: null,
      relativePath: "Author/Book/notes.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(existing.absolutePath, existing);
    state.fileAssetsById.set(existing.id, existing);
    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "phash",
          sizeBytes: 2n,
        };
      }),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      expect.anything(),
    );
  });

  it("parses audiobook metadata.json with ID3 supplement", async () => {
    const state = createEmptyState("/tmp/root");
    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const audioSibling: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "audio-hash",
      id: "file-audio",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "audio-phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioSibling.absolutePath, audioSibling);
    state.fileAssetsById.set(audioSibling.id, audioSibling);

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseAudiobookJson: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Project Hail Mary",
          authors: ["Andy Weir"],
          narrators: ["Ray Porter"],
          series: [{ name: "Standalone", sequence: "1" }],
          genres: ["Sci-Fi"],
          publisher: "Audible",
          publishedYear: "2021",
          isbn: "9780593135204",
          asin: "B08GB58KD5",
          description: "A great book",
          language: "en",
        };
      }),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Chapter 01",
          album: "PHM",
          artist: "Weir",
          genres: [],
          albumArtist: undefined,
          year: undefined,
          comment: undefined,
          trackNumber: 1,
          trackTotal: 12,
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audiobook-json",
      status: "parsed",
      normalized: {
        title: "Project Hail Mary",
        authors: ["Andy Weir"],
        narrators: ["Ray Porter"],
      },
    });
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      { fileAssetId: "file-1" },
    );
  });

  it("parses standalone AUDIO file with ID3 metadata when no metadata.json sibling exists", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Chapter 01",
          album: "Project Hail Mary",
          artist: "Andy Weir",
          albumArtist: "Andy Weir",
          year: 2021,
          genres: ["Sci-Fi"],
          comment: undefined,
          trackNumber: 1,
          trackTotal: 12,
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audio-id3",
      status: "parsed",
    });
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      { fileAssetId: "file-1" },
    );
  });

  it("skips AUDIO file when sibling metadata.json is already parsed", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "sidecar-hash",
      id: "file-sidecar",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: {
        source: "audiobook-json",
        status: "parsed",
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        warnings: [],
        normalized: {
          title: "Test",
          authors: ["Author"],
          identifiers: { unknown: [] },
        },
      } as unknown as FileAsset["metadata"],
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "sidecar-phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Chapter 01",
          album: "Test",
          artist: "Author",
          albumArtist: undefined,
          year: undefined,
          genres: [],
          comment: undefined,
          trackNumber: undefined,
          trackTotal: undefined,
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      fileAssetId: "file-1",
      skipped: true,
    });
  });

  it("handles metadata.json ENOENT by marking file as MISSING", async () => {
    const state = createEmptyState("/tmp/root");
    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudiobookJson: vi.fn(async () => {
        await Promise.resolve();
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.MISSING,
      fileAssetId: "file-1",
    });
    expect(state.fileAssetsById.get("file-1")?.availabilityStatus).toBe(
      AvailabilityStatus.MISSING,
    );
  });

  it("handles metadata.json parse error (non-ENOENT) as unparseable", async () => {
    const state = createEmptyState("/tmp/root");
    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudiobookJson: vi.fn(async () => {
        await Promise.resolve();
        throw new Error("bad json");
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audiobook-json",
      status: "unparseable",
      warnings: ["bad json"],
    });
  });

  it("handles audio ID3 ENOENT by marking file as MISSING", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.MISSING,
      fileAssetId: "file-1",
    });
    expect(state.fileAssetsById.get("file-1")?.availabilityStatus).toBe(
      AvailabilityStatus.MISSING,
    );
  });

  it("handles audio ID3 parse error (non-ENOENT) as unparseable", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        throw new Error("Unsupported format");
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audio-id3",
      status: "unparseable",
    });
  });

  it("does not enqueue MATCH_FILE_ASSET_TO_EDITION for AUDIO without enough metadata", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: undefined,
          album: undefined,
          artist: undefined,
          albumArtist: undefined,
          year: undefined,
          genres: [],
          comment: undefined,
          trackNumber: undefined,
          trackTotal: undefined,
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audio-id3",
      status: "parsed",
    });
    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      expect.anything(),
    );
  });

  it("creates AUDIOBOOK edition from metadata.json sidecar with narrators and audio track links", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-1",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          narrators: ["Ray Porter"],
          identifiers: {
            isbn13: "9780593135204",
            asin: "B08GB58KD5",
            unknown: [],
          },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as unknown as FileAsset["metadata"],
    });

    const audioSibling: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "audio-hash",
      id: "file-audio",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "audio-phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioSibling.absolutePath, audioSibling);
    state.fileAssetsById.set(audioSibling.id, audioSibling);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result).toMatchObject({
      createdEdition: true,
      createdEditionFile: true,
      createdWork: true,
      skipped: false,
    });

    expect(result.editionId).toBeDefined();
    const edition = state.editions.get(result.editionId as string);
    expect(edition).toMatchObject({
      formatFamily: FormatFamily.AUDIOBOOK,
    });

    // Verify narrator contributors
    const narratorContributors = [...state.editionContributors.values()].filter(
      (ec) => ec.role === ContributorRole.NARRATOR,
    );
    expect(narratorContributors).toHaveLength(1);

    // Verify audio track links
    const audioTrackLinks = [...state.editionFiles.values()].filter(
      (ef) => ef.role === EditionFileRole.AUDIO_TRACK,
    );
    expect(audioTrackLinks).toHaveLength(1);
    expect(audioTrackLinks[0]?.fileAssetId).toBe("file-audio");
  });

  it("creates AUDIOBOOK edition from standalone AUDIO file with ID3 metadata", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      basename: "chapter01.mp3",
      extension: "mp3",
      id: "file-1",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Author/Book/chapter01.mp3",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audio-id3",
        status: "parsed",
        warnings: [],
      } as unknown as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result).toMatchObject({
      createdEdition: true,
      createdWork: true,
      skipped: false,
    });

    expect(result.editionId).toBeDefined();
    const edition = state.editions.get(result.editionId as string);
    expect(edition).toMatchObject({
      formatFamily: FormatFamily.AUDIOBOOK,
    });
  });

  it("tolerates ID3 failure during metadata.json parsing (non-fatal supplement)", async () => {
    const state = createEmptyState("/tmp/root");
    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const audioSibling: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "audio-hash",
      id: "file-audio",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "audio-phash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 100n,
    };
    state.fileAssets.set(audioSibling.absolutePath, audioSibling);
    state.fileAssetsById.set(audioSibling.id, audioSibling);

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseAudiobookJson: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Project Hail Mary",
          authors: ["Andy Weir"],
          narrators: ["Ray Porter"],
          series: [],
          genres: ["Sci-Fi"],
          publisher: "Audible",
        };
      }),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        throw new Error("ID3 parsing failed");
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "file-1",
      skipped: false,
    });
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audiobook-json",
      status: "parsed",
    });
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      { fileAssetId: "file-1" },
    );
  });

  it("parses standalone AUDIO when sibling metadata.json exists but is unparseable", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "ahash",
      id: "file-audio",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "aphash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 1000n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "shash",
      id: "file-sidecar",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: {
        source: "audiobook-json",
        status: "unparseable",
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        warnings: ["bad json"],
      },
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "sphash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 50n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Chapter 01",
          album: "Test Book",
          artist: "Author",
          albumArtist: "Author",
          year: 2021,
          genres: [],
          comment: undefined,
          trackNumber: 1,
          trackTotal: 5,
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-audio",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    expect(state.fileAssetsById.get("file-audio")?.metadata).toMatchObject({
      source: "audio-id3",
      status: "parsed",
    });
  });

  it("uses ID3 artist fallback when albumArtist is absent for standalone AUDIO", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "ahash",
      id: "file-audio",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "aphash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 1000n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: undefined,
          album: "The Book",
          artist: "Artist Only",
          albumArtist: undefined,
          year: undefined,
          genres: [],
          comment: undefined,
          trackNumber: undefined,
          trackTotal: undefined,
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-audio",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    const metadata = state.fileAssetsById.get("file-audio")?.metadata as Record<string, unknown>;
    const normalized = metadata.normalized as { authors: string[] };
    expect(normalized.authors).toEqual(["Artist Only"]);
  });

  it("uses fallback warning for non-Error audio ID3 parse failures", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "ahash",
      id: "file-audio",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.AUDIO,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "aphash",
      relativePath: "Author/Book/chapter01.mp3",
      sizeBytes: 1000n,
    };
    state.fileAssets.set(audioAsset.absolutePath, audioAsset);
    state.fileAssetsById.set(audioAsset.id, audioAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudioId3: vi.fn().mockRejectedValueOnce("bad-value"),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-audio",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    expect(state.fileAssetsById.get("file-audio")?.metadata).toMatchObject({
      source: "audio-id3",
      status: "unparseable",
      warnings: ["Unknown audio ID3 parsing error"],
    });
  });

  it("parses audiobook metadata.json with no audio siblings in directory", async () => {
    const state = createEmptyState("/tmp/root");
    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    // No audio siblings added to state

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const parseAudioId3 = vi.fn();
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseAudiobookJson: vi.fn(async () => {
        await Promise.resolve();
        return {
          title: "Lonely Sidecar",
          authors: ["Some Author"],
          narrators: [],
          series: [],
          genres: [],
        };
      }),
      parseAudioId3,
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    // ID3 parser should never be called since there are no audio siblings
    expect(parseAudioId3).not.toHaveBeenCalled();
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audiobook-json",
      status: "parsed",
    });
    // Should still enqueue MATCH
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      "match-file-asset-to-edition",
      { fileAssetId: "file-1" },
    );
  });

  it("handles non-Error throw from parseAudiobookJson", async () => {
    const state = createEmptyState("/tmp/root");
    const sidecarAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudiobookJson: vi.fn().mockRejectedValueOnce("string-error"),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      source: "audiobook-json",
      status: "unparseable",
      warnings: ["Unknown audiobook metadata.json parsing error"],
    });
  });
});

describe("matchFileAssetToEdition enqueues DETECT_DUPLICATES", () => {
  it("enqueues detect-duplicates after a successful match", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      metadata: {
        normalized: {
          authors: ["Test Author"],
          identifiers: { isbn13: "9780316498834", unknown: [] },
          title: "Test Book",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      },
    });
    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.skipped).toBe(false);
    expect(enqueueMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.DETECT_DUPLICATES,
      { fileAssetId: "file-1" },
    );
  });

  it("does not enqueue detect-duplicates when match is skipped", async () => {
    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(createEmptyState("/tmp/root")),
      enqueueLibraryJob: enqueueMock,
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "missing-file" });

    expect(result.skipped).toBe(true);
    expect(enqueueMock).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.DETECT_DUPLICATES,
      expect.anything(),
    );
  });
});

describe("detectDuplicates", () => {
  const now = new Date("2025-01-01");

  function addDetectFileAsset(state: TestState, id: string, hash: string | null, absPath: string) {
    const fa: TestFileAsset = {
      absolutePath: absPath,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      basename: path.basename(absPath),
      ctime: now,
      extension: ".epub",
      fullHash: hash,
      id,
      lastSeenAt: now,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: now,
      partialHash: hash,
      relativePath: absPath.replace("/tmp/root/", ""),
      sizeBytes: BigInt(1000),
    };
    state.fileAssetsById.set(id, fa);
    state.fileAssets.set(absPath, fa);
    return fa;
  }

  function addDetectEdition(state: TestState, id: string, workId: string, overrides: Partial<TestEdition> = {}) {
    const ed: TestEdition = {
      asin: null,
      formatFamily: FormatFamily.EPUB,
      id,
      isbn10: null,
      isbn13: null,
      publishedAt: null,
      publisher: null,
      workId,
      ...overrides,
    };
    state.editions.set(id, ed);
    return ed;
  }

  function addDetectWork(state: TestState, id: string, titleCanonical: string, titleDisplay: string) {
    const w: TestWork = {
      description: null,
      enrichmentStatus: "STUB" as EnrichmentStatus,
      id,
      language: null,
      seriesId: null,
      seriesPosition: null,
      sortTitle: null,
      titleCanonical,
      titleDisplay,
    };
    state.works.set(id, w);
    return w;
  }

  function addDetectEditionFile(state: TestState, efId: string, editionId: string, fileAssetId: string) {
    state.editionFiles.set(getEditionFileKey(editionId, fileAssetId), {
      editionId,
      fileAssetId,
      id: efId,
      role: EditionFileRole.PRIMARY,
    });
  }

  function addDetectContributor(state: TestState, id: string, name: string) {
    const c: TestContributor = { id, nameCanonical: name.toLowerCase(), nameDisplay: name };
    state.contributors.set(id, c);
    state.contributorsByCanonical.set(c.nameCanonical, c);
    return c;
  }

  function addDetectEditionContributor(state: TestState, ecId: string, editionId: string, contributorId: string) {
    state.editionContributors.set(getEditionContributorKey(editionId, contributorId, ContributorRole.AUTHOR), {
      contributorId,
      editionId,
      id: ecId,
      role: ContributorRole.AUTHOR,
    });
  }

  it("skips when file asset is not found", async () => {
    const state = createEmptyState();
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "nonexistent" });

    expect(result).toEqual({ fileAssetId: "nonexistent", skipped: true, candidatesCreated: 0 });
  });

  it("skips when file asset has no linked edition file", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "abc123", "/tmp/root/book.epub");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result).toEqual({ fileAssetId: "file-1", skipped: true, candidatesCreated: 0 });
  });

  it("skips when edition is not found for edition file", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "abc123", "/tmp/root/book.epub");
    addDetectEditionFile(state, "ef-1", "missing-edition", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result).toEqual({ fileAssetId: "file-1", skipped: true, candidatesCreated: 0 });
  });

  it("SAME_HASH: creates candidate when another file asset has the same hash", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "samehash", "/tmp/root/book.epub");
    addDetectFileAsset(state, "file-2", "samehash", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(1);
    expect(result.skipped).toBe(false);
    const candidates = [...state.duplicateCandidates.values()];
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      leftFileAssetId: "file-1",
      rightFileAssetId: "file-2",
      reason: "SAME_HASH",
      confidence: 1.0,
    });
  });

  it("SAME_HASH: does not create candidate when no hash match", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectFileAsset(state, "file-2", "hash-b", "/tmp/root/other.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
    expect(state.duplicateCandidates.size).toBe(0);
  });

  it("SAME_HASH: skips hash check when file has no fullHash", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", null, "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("SAME_ISBN: creates candidate when another edition shares isbn13", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book b", "Book B");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(1);
    const candidates = [...state.duplicateCandidates.values()];
    expect(candidates[0]).toMatchObject({
      leftEditionId: "edition-1",
      rightEditionId: "edition-2",
      reason: "SAME_ISBN",
      confidence: 1.0,
    });
  });

  it("SAME_ISBN: creates candidate when another edition shares isbn10", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book b", "Book B");
    addDetectEdition(state, "edition-1", "work-1", { isbn10: "1234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn10: "1234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(1);
    const candidates = [...state.duplicateCandidates.values()];
    expect(candidates[0]).toMatchObject({
      leftEditionId: "edition-1",
      rightEditionId: "edition-2",
      reason: "SAME_ISBN",
      confidence: 1.0,
    });
  });

  it("SAME_ISBN: does not create candidate if pair already exists", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book b", "Book B");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    state.duplicateCandidates.set("existing-isbn", {
      id: "existing-isbn",
      leftEditionId: "edition-1",
      rightEditionId: "edition-2",
      leftFileAssetId: null,
      rightFileAssetId: null,
      reason: "SAME_ISBN",
      confidence: 1.0,
      status: "PENDING",
    });
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
    expect(state.duplicateCandidates.size).toBe(1);
  });

  it("SIMILAR_TITLE_AUTHOR: creates candidate when title and author similarity >= 0.85", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "the great gatspy", "The Great Gatspy");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectContributor(state, "c-1", "F Scott Fitzgerald");
    addDetectContributor(state, "c-2", "F Scott Fitzgerald");
    addDetectEditionContributor(state, "ec-1", "edition-1", "c-1");
    addDetectEditionContributor(state, "ec-2", "edition-2", "c-2");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(1);
    const candidates = [...state.duplicateCandidates.values()];
    expect(candidates[0]).toMatchObject({
      leftEditionId: "edition-1",
      rightEditionId: "edition-2",
      reason: "SIMILAR_TITLE_AUTHOR",
    });
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("SIMILAR_TITLE_AUTHOR: does not create candidate when similarity < 0.85", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "completely different title", "Completely Different Title");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectContributor(state, "c-1", "F Scott Fitzgerald");
    addDetectContributor(state, "c-2", "Another Author");
    addDetectEditionContributor(state, "ec-1", "edition-1", "c-1");
    addDetectEditionContributor(state, "ec-2", "edition-2", "c-2");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("SIMILAR_TITLE_AUTHOR: does not match when only one side has authors", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "the great gatsby", "The Great Gatsby");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    // Only work-1 has an author, work-2 does not
    addDetectContributor(state, "c-1", "F Scott Fitzgerald");
    addDetectEditionContributor(state, "ec-1", "edition-1", "c-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("SIMILAR_TITLE_AUTHOR: skips when both works have no authors", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "the great gatsby", "The Great Gatsby");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("SIMILAR_TITLE_AUTHOR: skips other work with no editions", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "the great gatsby", "The Great Gatsby");
    addDetectEdition(state, "edition-1", "work-1");
    // work-2 has no editions
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectContributor(state, "c-1", "F Scott Fitzgerald");
    addDetectEditionContributor(state, "ec-1", "edition-1", "c-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("does not create candidate if pair already exists", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "samehash", "/tmp/root/book.epub");
    addDetectFileAsset(state, "file-2", "samehash", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    // Pre-existing candidate
    state.duplicateCandidates.set("existing-dup", {
      id: "existing-dup",
      leftFileAssetId: "file-1",
      rightFileAssetId: "file-2",
      leftEditionId: null,
      rightEditionId: null,
      reason: "SAME_HASH",
      confidence: 1.0,
      status: "PENDING",
    });
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
    // Should still have just the original
    expect(state.duplicateCandidates.size).toBe(1);
  });

  it("does not create candidate if reversed pair already exists", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "samehash", "/tmp/root/book.epub");
    addDetectFileAsset(state, "file-2", "samehash", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    // Pre-existing candidate with reversed direction
    state.duplicateCandidates.set("existing-dup", {
      id: "existing-dup",
      leftFileAssetId: "file-2",
      rightFileAssetId: "file-1",
      leftEditionId: null,
      rightEditionId: null,
      reason: "SAME_HASH",
      confidence: 1.0,
      status: "PENDING",
    });
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("returns correct total count across multiple strategies", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "samehash", "/tmp/root/book.epub");
    addDetectFileAsset(state, "file-2", "samehash", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectWork(state, "work-2", "different title", "Different Title");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    // 1 from SAME_HASH + 1 from SAME_ISBN
    expect(result.candidatesCreated).toBe(2);
    expect(state.duplicateCandidates.size).toBe(2);
  });

  it("SIMILAR_TITLE_AUTHOR: does not create candidate if pair already exists", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "the great gatsby", "The Great Gatsby");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectContributor(state, "c-1", "F Scott Fitzgerald");
    addDetectContributor(state, "c-2", "F Scott Fitzgerald");
    addDetectEditionContributor(state, "ec-1", "edition-1", "c-1");
    addDetectEditionContributor(state, "ec-2", "edition-2", "c-2");
    // Pre-existing candidate for this pair
    state.duplicateCandidates.set("existing-sim", {
      id: "existing-sim",
      leftEditionId: "edition-1",
      rightEditionId: "edition-2",
      leftFileAssetId: null,
      rightFileAssetId: null,
      reason: "SIMILAR_TITLE_AUTHOR",
      confidence: 0.95,
      status: "PENDING",
    });
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    // Should not have created any new candidates
    expect(result.candidatesCreated).toBe(0);
    expect(state.duplicateCandidates.size).toBe(1);
  });

  it("SIMILAR_TITLE_AUTHOR: skips other work with no titleCanonical", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "the great gatsby", "The Great Gatsby");
    addDetectWork(state, "work-2", "", "");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectContributor(state, "c-1", "F Scott Fitzgerald");
    addDetectEditionContributor(state, "ec-1", "edition-1", "c-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });

  it("skips similarity check when current work has no titleCanonical", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "", "");
    addDetectWork(state, "work-2", "other book", "Other Book");
    addDetectEdition(state, "edition-1", "work-1");
    addDetectEdition(state, "edition-2", "work-2");
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
  });
});
