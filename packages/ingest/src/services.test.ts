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
import type { Prisma } from "@bookhouse/db";
import { LIBRARY_JOB_NAMES, type LibraryJobName, type LibraryJobPayloads, type QueueProgressData } from "@bookhouse/shared";
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

interface TestMatchSuggestion {
  suggestedWorkId: string;
  confidence: number | null;
  targetWorkId: string;
  id: string;
  matchType: string;
  reviewStatus: string;
}

interface TestState {
  matchSuggestions: Map<string, TestMatchSuggestion>;
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
  scanMode: "FULL" | "INCREMENTAL";
  works: Map<string, TestWork>;
}

interface TestWork {
  coverPath: string | null;
  description: string | null;
  enrichmentStatus: EnrichmentStatus;
  id: string;
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
  language: string | null;
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

function createEmptyState(rootPath = "/tmp/root", scanMode: "FULL" | "INCREMENTAL" = "INCREMENTAL"): TestState {
  return {
    matchSuggestions: new Map(),
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
    scanMode,
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
  let matchSuggestionSequence = state.matchSuggestions.size;
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
          scanMode: state.scanMode,
        };
      },
      async update({ data, where }) {
        await Promise.resolve();
        if (where.id !== "root-1") {
          throw new Error(`Unexpected library root update: ${where.id}`);
        }

        state.lastScannedAt = data.lastScannedAt;
        if (data.scanMode !== undefined) {
          state.scanMode = data.scanMode;
        }
        return {
          id: "root-1",
          lastScannedAt: state.lastScannedAt,
          path: state.rootPath,
          scanMode: state.scanMode,
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
      async updateMany({ data, where }) {
        await Promise.resolve();
        let count = 0;
        for (const id of where.id.in) {
          const existing = state.fileAssetsById.get(id);
          if (existing === undefined) {
            continue;
          }
          const updated = { ...existing, ...data };
          state.fileAssets.set(updated.absolutePath, updated);
          state.fileAssetsById.set(updated.id, updated);
          count += 1;
        }
        return { count };
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
          coverPath: null,
          description: null,
          enrichmentStatus: "ENRICHED",
          id: `work-${String(workSequence)}`,
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
      async findManyByIds({ ids }) {
        await Promise.resolve();
        return ids
          .map((id) => state.works.get(id))
          .filter((work): work is TestWork => work !== undefined);
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
          if (edition.formatFamily !== where.formatFamily) return false;
          return where.OR.some((clause: Record<string, string | null>) =>
            Object.entries(clause).every(([key, value]) => edition[key as keyof TestEdition] === value),
          );
        });
      },
      async findUnique({ where }) {
        await Promise.resolve();
        return state.editions.get(where.id) ?? null;
      },
      async findManyByIds({ ids }) {
        await Promise.resolve();
        return ids
          .map((id) => state.editions.get(id))
          .filter((edition): edition is TestEdition => edition !== undefined);
      },
      async update({ data, where }) {
        await Promise.resolve();
        const existing = state.editions.get(where.id);
        if (!existing) throw new Error(`Unknown edition: ${where.id}`);
        const updated: TestEdition = { ...existing, ...data } as TestEdition;
        state.editions.set(updated.id, updated);
        return updated;
      },
      async updateMany({ data, where }) {
        await Promise.resolve();
        let count = 0;
        for (const [id, edition] of state.editions) {
          if (edition.workId === where.workId) {
            state.editions.set(id, { ...edition, ...data });
            count += 1;
          }
        }
        return { count };
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
      async findMany({ where }) {
        await Promise.resolve();
        return [...state.editionFiles.values()].filter(
          (editionFile) =>
            (where.fileAssetId === undefined
              || (typeof where.fileAssetId === "object"
                ? where.fileAssetId.in.includes(editionFile.fileAssetId)
                : editionFile.fileAssetId === where.fileAssetId)) &&
            (where.editionId === undefined || editionFile.editionId === where.editionId),
        );
      },
      async update({ where, data }) {
        await Promise.resolve();
        const existing = [...state.editionFiles.values()].find((ef) => ef.id === where.id);
        if (!existing) throw new Error(`Unknown edition file: ${where.id}`);
        // Remove old key
        state.editionFiles.delete(getEditionFileKey(existing.editionId, existing.fileAssetId));
        const updated = { ...existing, ...data };
        state.editionFiles.set(getEditionFileKey(updated.editionId, updated.fileAssetId), updated);
        return updated;
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
    matchSuggestion: {
      async create({ data }) {
        await Promise.resolve();
        matchSuggestionSequence += 1;
        const created: TestMatchSuggestion = {
          id: `audio-link-${String(matchSuggestionSequence)}`,
          targetWorkId: data.targetWorkId,
          suggestedWorkId: data.suggestedWorkId,
          matchType: data.matchType,
          confidence: data.confidence,
          reviewStatus: "PENDING",
        };
        state.matchSuggestions.set(created.id, created);
        return created;
      },
      async findFirst({ where }: { where: { targetWorkId?: string; suggestedWorkId?: string } }) {
        await Promise.resolve();
        return [...state.matchSuggestions.values()].find(
          (al) => {
            if (where.targetWorkId && al.targetWorkId !== where.targetWorkId) return false;
            if (where.suggestedWorkId && al.suggestedWorkId !== where.suggestedWorkId) return false;
            return true;
          },
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
    coverPath: null,
    description: null,
    enrichmentStatus: "ENRICHED",
    id: "work-1",
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
    language: null,
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
      basename: "book.epub",
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

  it("uses FULL for the first scan, then defaults later scans back to incremental", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-scan-full-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "first");

    const state = createEmptyState(directory, "FULL");
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const firstScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });
    expect(firstScan.enqueuedHashJobs).toEqual(["file-1"]);
    expect(state.scanMode).toBe("INCREMENTAL");

    const fileAsset = state.fileAssetsById.get("file-1");
    if (fileAsset === undefined) {
      throw new Error("Expected FULL scan to create file asset");
    }
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";

    const secondScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(secondScan.enqueuedHashJobs).toEqual([]);

    const thirdScan = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      scanMode: "FULL",
      now: new Date("2025-01-01T00:20:00.000Z"),
    });

    expect(thirdScan.enqueuedHashJobs).toEqual(["file-1"]);
    expect(state.scanMode).toBe("INCREMENTAL");
  });

  it("skips per-file upserts for unchanged hashed files in incremental mode and bulk-refreshes lastSeenAt", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-scan-incremental-"));
    tempDirectories.push(directory);

    const absolutePath = path.join(directory, "book.epub");
    await writeFile(absolutePath, "first");
    const timestamp = new Date("2025-01-01T00:00:00.000Z");
    await utimes(absolutePath, timestamp, timestamp);

    const state = createEmptyState(directory, "INCREMENTAL");
    const existingFileAsset: TestFileAsset = {
      absolutePath,
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: timestamp,
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: new Date("2024-12-31T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: timestamp,
      partialHash: "partial",
      relativePath: "book.epub",
      sizeBytes: BigInt("first".length),
    };
    state.fileAssets.set(existingFileAsset.absolutePath, existingFileAsset);
    state.fileAssetsById.set(existingFileAsset.id, existingFileAsset);

    const db = createTestDb(state);
    const upsertSpy = vi.spyOn(db.fileAsset, "upsert");
    const updateManySpy = vi.spyOn(db.fileAsset, "updateMany");
    const services = createIngestServices({
      db,
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });
    const scanAt = new Date("2025-01-01T00:10:00.000Z");

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: scanAt,
    });

    expect(result.scannedFileAssetIds).toEqual(["file-1"]);
    expect(result.enqueuedHashJobs).toEqual([]);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { id: { in: ["file-1"] } },
      data: { lastSeenAt: scanAt },
    });
    expect(state.fileAssetsById.get("file-1")?.lastSeenAt).toEqual(scanAt);
  });

  it("marks missing files with a bulk update", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-scan-missing-"));
    tempDirectories.push(directory);

    const state = createEmptyState(directory, "INCREMENTAL");
    const missingFileAsset: TestFileAsset = {
      absolutePath: path.join(directory, "missing.epub"),
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "missing.epub",
      ctime: new Date("2025-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: new Date("2024-12-31T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2025-01-01T00:00:00.000Z"),
      partialHash: "partial",
      relativePath: "missing.epub",
      sizeBytes: 5n,
    };
    state.fileAssets.set(missingFileAsset.absolutePath, missingFileAsset);
    state.fileAssetsById.set(missingFileAsset.id, missingFileAsset);

    const db = createTestDb(state);
    const updateSpy = vi.spyOn(db.fileAsset, "update");
    const updateManySpy = vi.spyOn(db.fileAsset, "updateMany");
    const services = createIngestServices({
      db,
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(result.missingFileAssetIds).toEqual(["file-1"]);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { id: { in: ["file-1"] } },
      data: { availabilityStatus: AvailabilityStatus.MISSING },
    });
    expect(state.fileAssetsById.get("file-1")?.availabilityStatus).toBe(AvailabilityStatus.MISSING);
  });

  it("skips recovery for unchanged hashed files without a recoverable format family", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-scan-cover-"));
    tempDirectories.push(directory);

    const absolutePath = path.join(directory, "cover.jpg");
    await writeFile(absolutePath, "cover");
    const timestamp = new Date("2025-01-01T00:00:00.000Z");
    await utimes(absolutePath, timestamp, timestamp);

    const state = createEmptyState(directory, "INCREMENTAL");
    const existingFileAsset: TestFileAsset = {
      absolutePath,
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "cover.jpg",
      ctime: timestamp,
      extension: "jpg",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: new Date("2024-12-31T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: MediaKind.COVER,
      metadata: null,
      mtime: timestamp,
      partialHash: "partial",
      relativePath: "cover.jpg",
      sizeBytes: BigInt("cover".length),
    };
    state.fileAssets.set(existingFileAsset.absolutePath, existingFileAsset);
    state.fileAssetsById.set(existingFileAsset.id, existingFileAsset);

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(result.enqueuedHashJobs).toEqual([]);
    expect(result.enqueuedRecoveryJobs).toEqual([]);
  });

  it("skips unchanged recovery when an edition link exists but the linked work is missing", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-scan-missing-work-"));
    tempDirectories.push(directory);

    const absolutePath = path.join(directory, "book.epub");
    await writeFile(absolutePath, "book");
    const timestamp = new Date("2025-01-01T00:00:00.000Z");
    await utimes(absolutePath, timestamp, timestamp);

    const state = createEmptyState(directory, "INCREMENTAL");
    const existingFileAsset: TestFileAsset = {
      absolutePath,
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: timestamp,
      extension: "epub",
      fullHash: "full",
      id: "file-1",
      lastSeenAt: new Date("2024-12-31T00:00:00.000Z"),
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: timestamp,
      partialHash: "partial",
      relativePath: "book.epub",
      sizeBytes: BigInt("book".length),
    };
    state.fileAssets.set(existingFileAsset.absolutePath, existingFileAsset);
    state.fileAssetsById.set(existingFileAsset.id, existingFileAsset);
    state.editions.set("edition-1", {
      asin: null,
      formatFamily: FormatFamily.EBOOK,
      id: "edition-1",
      isbn10: null,
      isbn13: null,
      language: null,
      publishedAt: null,
      publisher: null,
      workId: "missing-work",
    });
    state.editionFiles.set(getEditionFileKey("edition-1", "file-1"), {
      editionId: "edition-1",
      fileAssetId: "file-1",
      id: "edition-file-1",
      role: EditionFileRole.PRIMARY,
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.scanLibraryRoot({
      libraryRootId: "root-1",
      now: new Date("2025-01-01T00:10:00.000Z"),
    });

    expect(result.enqueuedHashJobs).toEqual([]);
    expect(result.enqueuedRecoveryJobs).toEqual([]);
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

    // First call: totalFiles after discovery with DISCOVERY stage
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ totalFiles: 3, scanStage: "DISCOVERY" }),
    );
    // Last call: final processedFiles, errorCount, and PROCESSING stage
    const allCalls = reportProgress.mock.calls as object as Array<[QueueProgressData]>;
    expect(allCalls.length).toBeGreaterThan(0);
    const lastProgressCall = allCalls[allCalls.length - 1] as [QueueProgressData];
    expect(lastProgressCall[0]).toMatchObject({ processedFiles: 3, errorCount: 0, scanStage: "PROCESSING" });
    expect(lastProgressCall[0]).not.toHaveProperty("totalProcessingJobs");
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
    ) as object as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1", reportProgress });

    // Should have batch call at processedFiles === SCAN_PROGRESS_INTERVAL
    const batchCall = (reportProgress.mock.calls as object as Array<[QueueProgressData]>).find(
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
    const readStats = vi.fn(() => Promise.reject(new Error("gone"))) as object as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1", reportProgress });

    const batchCall = (reportProgress.mock.calls as object as Array<[QueueProgressData]>).find(
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
    ) as object as LstatFn;

    const reportProgress = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      listDirectory,
      readStats,
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1", reportProgress });

    const batchCall = (reportProgress.mock.calls as object as Array<[QueueProgressData]>).find(
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
    }) as object as LstatFn;

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

    const calls = reportProgress.mock.calls as object as Array<[QueueProgressData]>;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1] as [QueueProgressData];
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
    const allCalls = enqueueMock.mock.calls as object as [string, { workId: string; fileAssetId: string }][];
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
    const allAudioCalls = enqueueMock.mock.calls as object as [string, { workId: string; fileAssetId: string }][];
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
    ) as object as LstatFn;

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

  it("re-enqueues PARSE for existing unchanged EPUB with hashes but no metadata and no EditionFile link", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-parse-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";

    // Remove EditionFile link so recovery checks metadata (early-pipeline recovery)
    for (const [key, ef] of state.editionFiles) {
      if (ef.fileAssetId === fileAsset.id) {
        state.editionFiles.delete(key);
      }
    }

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(result.enqueuedHashJobs).toEqual([]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues MATCH for existing unchanged EPUB with parsed metadata but no EditionFile link", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-match-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      normalized: { title: "Book", authors: ["Author"] },
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "epub",
      status: "parsed",
      warnings: [],
    };

    for (const [key, ef] of state.editionFiles) {
      if (ef.fileAssetId === fileAsset.id) {
        state.editionFiles.delete(key);
      }
    }

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues MATCH for existing file linked to STUB work", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-stub-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      normalized: { title: "Book", authors: ["Author"] },
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "epub",
      status: "parsed",
      warnings: [],
    };

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    expect(work.enrichmentStatus).toBe("STUB");

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("also enqueues PROCESS_COVER for STUB work with null coverPath during recovery", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-stub-cover-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    expect(work.enrichmentStatus).toBe("STUB");
    expect(work.coverPath).toBeNull();

    enqueuedJobs.length = 0;

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Should enqueue both MATCH (for enrichment) and PROCESS_COVER (for missing cover)
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      payload: { fileAssetId: fileAsset.id },
    });
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PROCESS_COVER,
      payload: { workId: work.id, fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues PROCESS_COVER for existing file linked to enriched work with no cover", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-cover-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      normalized: { title: "Book", authors: ["Author"] },
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "epub",
      status: "parsed",
      warnings: [],
    };

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = null;

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PROCESS_COVER,
      payload: { workId: work.id, fileAssetId: fileAsset.id },
    });
  });

  it("does not enqueue recovery jobs for fully processed files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-none-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      normalized: { title: "Book", authors: ["Author"] },
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "epub",
      status: "parsed",
      warnings: [],
    };

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = "/covers/book.webp";

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([]);
    expect(result.enqueuedHashJobs).toEqual([]);
    expect(enqueuedJobs).toEqual([]);
  });

  it("skips recovery when edition link exists but edition is missing", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-orphan-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      normalized: { title: "Book", authors: ["Author"] },
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "epub",
      status: "parsed",
      warnings: [],
    };

    state.editions.clear();

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([]);
    expect(enqueuedJobs).toEqual([]);
  });

  it("does not enqueue PARSE recovery for PDF files with no metadata and no EditionFile link", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-pdf-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "doc.pdf"), "pdf-content");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    // First scan
    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Simulate completed HASH but no metadata (PDFs are not parseable)
    const fileAsset = state.fileAssets.get(path.join(directory, "doc.pdf"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";

    // Remove EditionFile link to test early-pipeline recovery (no link, no metadata)
    for (const [key, ef] of state.editionFiles) {
      if (ef.fileAssetId === fileAsset.id) {
        state.editionFiles.delete(key);
      }
    }

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // PDFs are not parseable, so PARSE should not be enqueued
    expect(result.enqueuedRecoveryJobs).toEqual([]);
    expect(enqueuedJobs).toEqual([]);
  });

  it("re-enqueues PARSE for existing unchanged AUDIO file with hashes but no metadata and no EditionFile link", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-audio-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "audiobook"));
    await writeFile(path.join(directory, "audiobook", "chapter1.mp3"), "audio");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "audiobook", "chapter1.mp3"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";

    // Remove EditionFile link so recovery checks metadata (early-pipeline recovery)
    for (const [key, ef] of state.editionFiles) {
      if (ef.fileAssetId === fileAsset.id) {
        state.editionFiles.delete(key);
      }
    }

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues PROCESS_COVER for EPUB with unparseable metadata but existing EditionFile link", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-unparseable-cover-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    // First scan creates stub
    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Simulate: HASH succeeded, PARSE failed (unparseable), but stub already created EditionFile link
    const fileAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "epub",
      status: "unparseable",
      warnings: ["Failed to parse EPUB"],
    };

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = null;

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PROCESS_COVER,
      payload: { workId: work.id, fileAssetId: fileAsset.id },
    });
    // Should NOT re-enqueue PARSE since EditionFile link already exists (EPUB)
    expect(enqueuedJobs).not.toContainEqual(
      expect.objectContaining({ jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA }),
    );
  });

  it("re-enqueues PARSE for edition-linked AUDIO file with unparseable metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-audio-unparseable-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "audiobook"));
    await writeFile(path.join(directory, "audiobook", "chapter1.mp3"), "audio");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    // First scan creates stub with EditionFile link
    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Simulate: HASH succeeded, PARSE failed with encoding error (unparseable), EditionFile link exists
    const fileAsset = state.fileAssets.get(path.join(directory, "audiobook", "chapter1.mp3"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "audio-id3",
      status: "unparseable",
      warnings: ["unsupported Unicode escape sequence"],
    };

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = "/covers/existing.jpg";

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toContain(fileAsset.id);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("does not duplicate recovery entry for AUDIO with unparseable metadata and missing cover", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-audio-dedup-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "audiobook"));
    await writeFile(path.join(directory, "audiobook", "chapter1.mp3"), "audio");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "audiobook", "chapter1.mp3"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      source: "audio-id3",
      status: "unparseable",
      warnings: ["unsupported Unicode escape sequence"],
    };

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = null; // Missing cover triggers PROCESS_COVER first

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // File appears only once in recovery list despite triggering both PROCESS_COVER and PARSE
    const occurrences = result.enqueuedRecoveryJobs.filter((id: string) => id === fileAsset.id);
    expect(occurrences).toHaveLength(1);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PROCESS_COVER,
      payload: { workId: work.id, fileAssetId: fileAsset.id },
    });
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues MATCH_SUGGESTIONS for AUDIO file linked to AUDIOBOOK edition during recovery", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-audio-match-"));
    tempDirectories.push(directory);

    await mkdir(path.join(directory, "audiobook"));
    await writeFile(path.join(directory, "audiobook", "chapter1.mp3"), "audio");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    // First scan creates stub with EditionFile link
    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Simulate: fully processed audiobook — hashed, edition-linked, work enriched, has cover
    const fileAsset = state.fileAssets.get(path.join(directory, "audiobook", "chapter1.mp3"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = null; // Audio files with metadata.json siblings have null metadata

    const edition = [...state.editions.values()][0];
    if (!edition) throw new Error("expected edition");
    // Edition must be AUDIOBOOK for MATCH_SUGGESTIONS recovery to trigger
    edition.formatFamily = FormatFamily.AUDIOBOOK;

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = "/covers/existing.jpg";

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Recovery should enqueue MATCH_SUGGESTIONS for the audio file
    expect(result.enqueuedRecoveryJobs).toContain(fileAsset.id);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues PROCESS_COVER for PDF with null metadata but existing EditionFile link", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-pdf-cover-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "doc.pdf"), "pdf-content");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    // First scan creates stub with EditionFile link
    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    // Simulate: HASH succeeded, metadata never set (PDFs aren't parseable), PROCESS_COVER failed
    const fileAsset = state.fileAssets.get(path.join(directory, "doc.pdf"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "ENRICHED";
    work.coverPath = null;

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toEqual([fileAsset.id]);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PROCESS_COVER,
      payload: { workId: work.id, fileAssetId: fileAsset.id },
    });
  });

  it("re-enqueues PARSE for existing unchanged OPF sidecar with fullHash but no metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-opf-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "metadata.opf"), "<package/>");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    // First scan creates the file asset
    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "metadata.opf"));
    if (!fileAsset) throw new Error("expected fileAsset");
    // Simulate: HASH succeeded but PARSE failed
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = null;

    enqueuedJobs.length = 0;

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.enqueuedRecoveryJobs).toContainEqual(fileAsset.id);
    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      payload: { fileAssetId: fileAsset.id },
    });
  });

  it("does NOT re-enqueue PARSE for OPF sidecar with already-parsed metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-opf-parsed-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "metadata.opf"), "<package/>");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const fileAsset = state.fileAssets.get(path.join(directory, "metadata.opf"));
    if (!fileAsset) throw new Error("expected fileAsset");
    fileAsset.partialHash = "partial";
    fileAsset.fullHash = "full";
    fileAsset.metadata = {
      normalized: { authors: [], identifiers: { unknown: [] } },
      parsedAt: "2025-01-01T00:00:00.000Z",
      parserVersion: 1,
      raw: {},
      source: "opf-sidecar",
      status: "parsed",
      warnings: [],
    } as TestFileAsset["metadata"];

    enqueuedJobs.length = 0;

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const opfRecoveryJobs = enqueuedJobs.filter(
      (j) => j.jobName === LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA &&
        "fileAssetId" in j.payload && j.payload.fileAssetId === fileAsset.id,
    );
    expect(opfRecoveryJobs).toHaveLength(0);
  });

  it("re-enqueues OPF PARSE for PDF linked to STUB work when OPF sibling exists", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-pdf-opf-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.pdf"), "pdf-content");
    await writeFile(path.join(directory, "metadata.opf"), "<package/>");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const pdfAsset = state.fileAssets.get(path.join(directory, "book.pdf"));
    if (!pdfAsset) throw new Error("expected pdfAsset");
    pdfAsset.partialHash = "partial";
    pdfAsset.fullHash = "full";

    const opfAsset = state.fileAssets.get(path.join(directory, "metadata.opf"));
    if (!opfAsset) throw new Error("expected opfAsset");
    opfAsset.partialHash = "opf-partial";
    opfAsset.fullHash = "opf-full";

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "STUB";

    enqueuedJobs.length = 0;

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      payload: { fileAssetId: opfAsset.id },
    });
  });

  it("falls back to MATCH for PDF linked to STUB work when no OPF sibling exists", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-pdf-no-opf-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.pdf"), "pdf-content");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const pdfAsset = state.fileAssets.get(path.join(directory, "book.pdf"));
    if (!pdfAsset) throw new Error("expected pdfAsset");
    pdfAsset.partialHash = "partial";
    pdfAsset.fullHash = "full";

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "STUB";

    enqueuedJobs.length = 0;

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      payload: { fileAssetId: pdfAsset.id },
    });
  });

  it("re-enqueues MATCH for EPUB linked to STUB work (unchanged behavior)", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-recovery-epub-stub-"));
    tempDirectories.push(directory);

    await writeFile(path.join(directory, "book.epub"), "epub-content");

    const state = createEmptyState(directory);
    const enqueuedJobs: Array<{ jobName: LibraryJobName; payload: LibraryJobPayloads[LibraryJobName] }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: (jobName, payload) => {
        enqueuedJobs.push({ jobName, payload });
        return Promise.resolve(undefined);
      },
    });

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    const epubAsset = state.fileAssets.get(path.join(directory, "book.epub"));
    if (!epubAsset) throw new Error("expected epubAsset");
    epubAsset.partialHash = "partial";
    epubAsset.fullHash = "full";

    const work = [...state.works.values()][0];
    if (!work) throw new Error("expected work");
    work.enrichmentStatus = "STUB";

    enqueuedJobs.length = 0;

    await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(enqueuedJobs).toContainEqual({
      jobName: LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      payload: { fileAssetId: epubAsset.id },
    });
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

  it("marks file as MISSING when hash fails with EPERM", async () => {
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

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        const error = new Error("permission denied") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }),
    });

    const result = await services.hashFileAsset({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      availabilityStatus: AvailabilityStatus.MISSING,
      fileAssetId: "file-1",
    });
    expect(state.fileAssetsById.get("file-1")).toMatchObject({
      availabilityStatus: AvailabilityStatus.MISSING,
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

  it("detects moved file by fullHash and transfers edition links from MISSING asset", async () => {
    const state = createEmptyState("/tmp/root");

    // Old file at old path — MISSING, with hash, linked to an enriched work
    const oldFile = addFileAsset(state, {
      absolutePath: "/tmp/root/old-folder/book.epub",
      availabilityStatus: AvailabilityStatus.MISSING,
      basename: "book.epub",
      fullHash: "same-hash-abc",
      id: "old-file",
      relativePath: "old-folder/book.epub",
    });
    const oldWork = addWork(state, {
      enrichmentStatus: "ENRICHED",
      id: "old-work",
      titleCanonical: "the fifth season",
      titleDisplay: "The Fifth Season",
    });
    const oldEdition = addEdition(state, {
      id: "old-edition",
      workId: oldWork.id,
    });
    addEditionFile(state, {
      editionId: oldEdition.id,
      fileAssetId: oldFile.id,
      id: "old-edition-file",
    });

    // New file at new path — PRESENT, no hash yet, with a stub work
    const newFile = addFileAsset(state, {
      absolutePath: "/tmp/root/new-folder/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      fullHash: null,
      id: "new-file",
      partialHash: null,
      relativePath: "new-folder/book.epub",
    });
    const stubWork = addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "book",
      titleDisplay: "book",
    });
    const stubEdition = addEdition(state, {
      id: "stub-edition",
      workId: stubWork.id,
    });
    addEditionFile(state, {
      editionId: stubEdition.id,
      fileAssetId: newFile.id,
      id: "stub-edition-file",
    });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "same-hash-abc",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "partial-abc",
          sizeBytes: 100n,
        };
      }),
    });

    const result = await services.hashFileAsset({
      fileAssetId: "new-file",
      now: new Date("2025-01-01T01:00:00.000Z"),
    });

    // Should detect move and return movedFromFileAssetId
    expect(result).toEqual({
      availabilityStatus: AvailabilityStatus.PRESENT,
      fileAssetId: "new-file",
      fullHash: "same-hash-abc",
      movedFromFileAssetId: "old-file",
      partialHash: "partial-abc",
    });

    // Old edition file should now point to new file
    const transferredEditionFile = [...state.editionFiles.values()].find(
      (ef) => ef.id === "old-edition-file",
    );
    expect(transferredEditionFile?.fileAssetId).toBe("new-file");

    // Stub work should be deleted
    expect(state.works.has("stub-work")).toBe(false);

    // Should NOT enqueue parse job (old edition already has metadata)
    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      expect.anything(),
    );
  });

  it("skips move detection when edition for current file is not found", async () => {
    const state = createEmptyState("/tmp/root");

    const file = addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      fullHash: null,
      id: "file-1",
    });
    // EditionFile points to a non-existent edition (orphaned link)
    addEditionFile(state, {
      editionId: "missing-edition",
      fileAssetId: file.id,
      id: "ef-1",
    });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash-abc",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "partial-abc",
          sizeBytes: 100n,
        };
      }),
    });

    const result = await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(result.movedFromFileAssetId).toBeUndefined();
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("skips move detection when current work is ENRICHED", async () => {
    const state = createEmptyState("/tmp/root");

    // File with an ENRICHED work — should NOT trigger move detection
    const file = addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      fullHash: null,
      id: "file-1",
    });
    const work = addWork(state, {
      enrichmentStatus: "ENRICHED",
      id: "work-1",
    });
    addEdition(state, { id: "edition-1", workId: work.id });
    addEditionFile(state, {
      editionId: "edition-1",
      fileAssetId: file.id,
      id: "ef-1",
    });

    // A MISSING file with same hash exists
    addFileAsset(state, {
      absolutePath: "/tmp/root/old/book.epub",
      availabilityStatus: AvailabilityStatus.MISSING,
      fullHash: "hash-xyz",
      id: "old-file",
      relativePath: "old/book.epub",
    });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "hash-xyz",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "partial-xyz",
          sizeBytes: 100n,
        };
      }),
    });

    const result = await services.hashFileAsset({ fileAssetId: "file-1" });

    // Should NOT detect a move — work is ENRICHED
    expect(result.movedFromFileAssetId).toBeUndefined();
    // Should enqueue parse job as normal (EPUB)
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("skips move detection when no MISSING file matches the hash", async () => {
    const state = createEmptyState("/tmp/root");

    const file = addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      fullHash: null,
      id: "file-1",
    });
    addWork(state, { enrichmentStatus: "STUB", id: "work-1" });
    addEdition(state, { id: "edition-1", workId: "work-1" });
    addEditionFile(state, {
      editionId: "edition-1",
      fileAssetId: file.id,
      id: "ef-1",
    });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "unique-hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "partial",
          sizeBytes: 100n,
        };
      }),
    });

    const result = await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(result.movedFromFileAssetId).toBeUndefined();
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("skips move detection when MISSING hash match has no edition file links", async () => {
    const state = createEmptyState("/tmp/root");

    const file = addFileAsset(state, {
      absolutePath: "/tmp/root/book.epub",
      fullHash: null,
      id: "file-1",
    });
    addWork(state, { enrichmentStatus: "STUB", id: "work-1" });
    addEdition(state, { id: "edition-1", workId: "work-1" });
    addEditionFile(state, {
      editionId: "edition-1",
      fileAssetId: file.id,
      id: "ef-1",
    });

    // MISSING file with same hash but no EditionFile links (orphaned)
    addFileAsset(state, {
      absolutePath: "/tmp/root/orphan.epub",
      availabilityStatus: AvailabilityStatus.MISSING,
      fullHash: "same-hash",
      id: "orphan-file",
      relativePath: "orphan.epub",
    });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => {
        await Promise.resolve();
        return {
          fullHash: "same-hash",
          mtime: new Date("2025-01-01T00:00:00.000Z"),
          partialHash: "partial",
          sizeBytes: 100n,
        };
      }),
    });

    const result = await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(result.movedFromFileAssetId).toBeUndefined();
    // Stub work should still exist
    expect(state.works.has("work-1")).toBe(true);
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
        mediaKind: "EPUB",
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
        mediaKind: "EPUB",
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
      mediaKind: "EPUB",
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
      mediaKind: "EPUB",
      skipped: false,
      workId: "work-1",
    });
    expect(state.works.get("work-1")).toEqual({
      coverPath: null,
      description: null,
      enrichmentStatus: "ENRICHED",
      id: "work-1",
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
      mediaKind: "EPUB",
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
      mediaKind: "EPUB",
      skipped: false,
      workId: undefined,
    });

    // Should NOT enqueue a cover job when edition is missing, only detect-duplicates and match-audio
    expect(enqueueLibraryJob).toHaveBeenCalledTimes(2);
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.DETECT_DUPLICATES,
      { fileAssetId: "file-1" },
    );
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
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
    expect(state.editions.get("edition-1")).toMatchObject({
      language: "en",
    });
    expect(state.works.get("work-1")).toMatchObject({
      description: "A story.",
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
      seriesId: "existing-series",
    });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: "Existing Publisher", publishedAt: new Date("2000-01-01"), language: "fr" });
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

    expect(state.editions.get("edition-1")).toMatchObject({ publisher: "Existing Publisher", language: "fr" });
    expect(state.works.get("work-1")).toMatchObject({
      description: "Existing description",
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

  it("OPF sidecar enrichment transitions STUB work to ENRICHED with title and authors", async () => {
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

    const pdfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.pdf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.pdf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "pdf",
      fullHash: "pdf-hash",
      id: "file-pdf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.PDF,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "pdf-phash",
      relativePath: "Author/Book/book.pdf",
      sizeBytes: 100n,
    };
    state.fileAssets.set(pdfAsset.absolutePath, pdfAsset);
    state.fileAssetsById.set(pdfAsset.id, pdfAsset);

    addWork(state, {
      id: "work-1",
      enrichmentStatus: "STUB",
      titleDisplay: "Book",
      titleCanonical: "book",
      coverPath: null,
    });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-pdf" });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [{ name: "Patrick Rothfuss" }],
          identifiers: [{ value: "9780756404741", scheme: "ISBN" }],
          subjects: [],
          title: "The Name of the Wind",
          publisher: "DAW Books",
          description: "A story.",
          language: "en",
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    const work = state.works.get("work-1");
    expect(work).toMatchObject({
      enrichmentStatus: "ENRICHED",
      titleDisplay: "The Name of the Wind",
      titleCanonical: "the name of the wind",
    });

    // Authors should be added as contributors
    const editionContributors = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "edition-1" && ec.role === ContributorRole.AUTHOR,
    );
    expect(editionContributors).toHaveLength(1);
    const firstContributor = editionContributors[0];
    if (!firstContributor) throw new Error("expected edition contributor");
    const contributor = state.contributors.get(firstContributor.contributorId);
    expect(contributor?.nameDisplay).toBe("Patrick Rothfuss");

    // Edition ISBN should be updated
    expect(state.editions.get("edition-1")?.isbn13).toBe("9780756404741");

    // PROCESS_COVER should be enqueued for coverless work
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PROCESS_COVER,
      { workId: "work-1", fileAssetId: "file-pdf" },
    );
  });

  it("OPF sidecar enrichment does NOT override title on ENRICHED work", async () => {
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
      enrichmentStatus: "ENRICHED",
      titleDisplay: "Original Title",
      titleCanonical: "original title",
    });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-epub" });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [{ name: "Some Author" }],
          identifiers: [],
          subjects: [],
          title: "Different Title",
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.works.get("work-1")).toMatchObject({
      enrichmentStatus: "ENRICHED",
      titleDisplay: "Original Title",
      titleCanonical: "original title",
    });
  });

  it("OPF sidecar enrichment does NOT enqueue PROCESS_COVER when work has cover", async () => {
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

    const pdfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.pdf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.pdf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "pdf",
      fullHash: "pdf-hash",
      id: "file-pdf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.PDF,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "pdf-phash",
      relativePath: "Author/Book/book.pdf",
      sizeBytes: 100n,
    };
    state.fileAssets.set(pdfAsset.absolutePath, pdfAsset);
    state.fileAssetsById.set(pdfAsset.id, pdfAsset);

    addWork(state, {
      id: "work-1",
      enrichmentStatus: "STUB",
      titleDisplay: "Book",
      titleCanonical: "book",
      coverPath: "work-1",
    });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-pdf" });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [],
          subjects: [],
          title: "The Name of the Wind",
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PROCESS_COVER,
      expect.anything(),
    );
  });

  it("OPF sidecar enrichment updates edition isbn10 and asin from OPF identifiers", async () => {
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

    const pdfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.pdf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.pdf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "pdf",
      fullHash: "pdf-hash",
      id: "file-pdf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.PDF,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "pdf-phash",
      relativePath: "Author/Book/book.pdf",
      sizeBytes: 100n,
    };
    state.fileAssets.set(pdfAsset.absolutePath, pdfAsset);
    state.fileAssetsById.set(pdfAsset.id, pdfAsset);

    addWork(state, { id: "work-1", enrichmentStatus: "STUB", titleDisplay: "Book", titleCanonical: "book" });
    addEdition(state, { id: "edition-1", workId: "work-1", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-pdf" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [
            { value: "0756404746", scheme: "ISBN" },
            { value: "B000FBJCJE", scheme: "AMAZON" },
          ],
          subjects: [],
          title: "The Name of the Wind",
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.editions.get("edition-1")?.isbn10).toBe("0756404746");
    expect(state.editions.get("edition-1")?.asin).toBe("B000FBJCJE");
  });

  it("OPF sidecar enrichment does NOT override existing edition ISBN", async () => {
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

    const pdfAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.pdf",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.pdf",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "pdf",
      fullHash: "pdf-hash",
      id: "file-pdf",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.PDF,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "pdf-phash",
      relativePath: "Author/Book/book.pdf",
      sizeBytes: 100n,
    };
    state.fileAssets.set(pdfAsset.absolutePath, pdfAsset);
    state.fileAssetsById.set(pdfAsset.id, pdfAsset);

    addWork(state, {
      id: "work-1",
      enrichmentStatus: "STUB",
      titleDisplay: "Book",
      titleCanonical: "book",
    });
    addEdition(state, { id: "edition-1", workId: "work-1", isbn13: "9781234567890", publisher: null, publishedAt: null });
    addEditionFile(state, { editionId: "edition-1", fileAssetId: "file-pdf" });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        return {
          authors: [],
          identifiers: [{ value: "9780756404741", scheme: "ISBN" }],
          subjects: [],
          title: "The Name of the Wind",
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-opf",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(state.editions.get("edition-1")?.isbn13).toBe("9781234567890");
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
          tags: {
            title: "Chapter 01",
            album: "PHM",
            artist: "Weir",
            genres: [],
            albumArtist: undefined,
            year: undefined,
            comment: undefined,
            trackNumber: 1,
            trackTotal: 12,
          },
          warnings: [],
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
          tags: {
            title: "Chapter 01",
            album: "Project Hail Mary",
            artist: "Andy Weir",
            albumArtist: "Andy Weir",
            year: 2021,
            genres: ["Sci-Fi"],
            comment: undefined,
            trackNumber: 1,
            trackTotal: 12,
          },
          warnings: [],
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
      } as object as FileAsset["metadata"],
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
          tags: {
            title: "Chapter 01",
            album: "Test",
            artist: "Author",
            albumArtist: undefined,
            year: undefined,
            genres: [],
            comment: undefined,
            trackNumber: undefined,
            trackTotal: undefined,
          },
          warnings: [],
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

  it("clears unparseable metadata on AUDIO file when sibling metadata.json is already parsed", async () => {
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
      metadata: {
        parsedAt: "2025-01-01T00:00:00.000Z",
        parserVersion: 1,
        source: "audio-id3",
        status: "unparseable",
        warnings: ["unsupported Unicode escape sequence"],
      } as object as FileAsset["metadata"],
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
      } as object as FileAsset["metadata"],
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
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      fileAssetId: "file-1",
      skipped: true,
    });

    // The unparseable metadata should be cleared so the file no longer shows as a library issue
    const updatedMetadata = state.fileAssetsById.get("file-1")?.metadata as Prisma.JsonObject | null;
    expect(updatedMetadata?.status).not.toBe("unparseable");
  });

  it("audio file with parsed metadata.json sibling creates editionFile link to same edition", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-audio",
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
          title: "Test Book",
          authors: ["Author Name"],
          identifiers: { unknown: [] },
        },
      } as object as FileAsset["metadata"],
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "sidecar-phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    // The metadata.json is already linked to an edition via editionFile
    const sidecarEditionFile: TestEditionFile = {
      id: "ef-sidecar",
      editionId: "edition-audiobook",
      fileAssetId: "file-sidecar",
      role: EditionFileRole.PRIMARY,
    };
    state.editionFiles.set(
      getEditionFileKey(sidecarEditionFile.editionId, sidecarEditionFile.fileAssetId),
      sidecarEditionFile,
    );

    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-audio",
      now: new Date("2025-06-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      fileAssetId: "file-audio",
      skipped: true,
    });

    // Audio file should now also be linked to the same edition as the metadata.json
    const audioEditionFile = [...state.editionFiles.values()].find(
      (ef) => ef.fileAssetId === "file-audio",
    );
    expect(audioEditionFile).toBeDefined();
    expect(audioEditionFile?.editionId).toBe("edition-audiobook");
    expect(audioEditionFile?.role).toBe(EditionFileRole.AUDIO_TRACK);

    // MATCH_SUGGESTIONS should be enqueued for the audio file so it can find ebook counterparts
    expect(enqueueMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "file-audio" },
    );
  });

  it("audio file with parsed metadata.json sibling does not create duplicate editionFile", async () => {
    const state = createEmptyState("/tmp/root");
    const audioAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/chapter01.mp3",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "chapter01.mp3",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "mp3",
      fullHash: "hash",
      id: "file-audio",
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
          title: "Test Book",
          authors: ["Author Name"],
          identifiers: { unknown: [] },
        },
      } as object as FileAsset["metadata"],
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "sidecar-phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 2n,
    };
    state.fileAssets.set(sidecarAsset.absolutePath, sidecarAsset);
    state.fileAssetsById.set(sidecarAsset.id, sidecarAsset);

    // Sidecar linked to edition
    const sidecarEditionFile: TestEditionFile = {
      id: "ef-sidecar",
      editionId: "edition-audiobook",
      fileAssetId: "file-sidecar",
      role: EditionFileRole.PRIMARY,
    };
    state.editionFiles.set(
      getEditionFileKey(sidecarEditionFile.editionId, sidecarEditionFile.fileAssetId),
      sidecarEditionFile,
    );

    // Audio file ALREADY linked to same edition (e.g., from previous scan)
    const existingAudioEditionFile: TestEditionFile = {
      id: "ef-audio-existing",
      editionId: "edition-audiobook",
      fileAssetId: "file-audio",
      role: EditionFileRole.AUDIO_TRACK,
    };
    state.editionFiles.set(
      getEditionFileKey(existingAudioEditionFile.editionId, existingAudioEditionFile.fileAssetId),
      existingAudioEditionFile,
    );

    const initialEditionFileCount = state.editionFiles.size;

    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-audio",
      now: new Date("2025-06-01T00:00:00.000Z"),
    });

    // Should not create a duplicate — count should remain the same
    expect(state.editionFiles.size).toBe(initialEditionFileCount);
    // Should NOT enqueue MATCH_SUGGESTIONS since the link already existed
    expect(enqueueMock).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      expect.anything(),
    );
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

  it("audio file with ID3 warnings gets status 'parsed' with warnings, not 'unparseable'", async () => {
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

    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        return {
          tags: {
            title: undefined,
            artist: undefined,
            albumArtist: undefined,
            album: undefined,
            year: undefined,
            genres: [],
            comment: undefined,
            trackNumber: undefined,
            trackTotal: undefined,
          },
          warnings: ["invalid byte sequence at offset 42"],
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
    // File should be marked as "parsed" with warnings, NOT "unparseable"
    const storedMetadata = state.fileAssetsById.get("file-1")?.metadata as Prisma.JsonObject;
    expect(storedMetadata.status).toBe("parsed");
    expect(storedMetadata.warnings).toEqual(["invalid byte sequence at offset 42"]);
    // Should enqueue MATCH_SUGGESTIONS since metadata is insufficient for edition matching
    expect(enqueueMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      expect.objectContaining({ fileAssetId: "file-1" }),
    );
  });

  it("re-throws transient ENOTCONN error from audio ID3 parsing instead of marking unparseable", async () => {
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

    const error = new Error("ENOTCONN: socket is not connected, close") as NodeJS.ErrnoException;
    error.code = "ENOTCONN";

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudioId3: vi.fn(async () => {
        await Promise.resolve();
        throw error;
      }),
    });

    await expect(
      services.parseFileAssetMetadata({
        fileAssetId: "file-1",
        now: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("ENOTCONN");

    // Metadata should NOT be set to unparseable
    expect(state.fileAssetsById.get("file-1")?.metadata).toBeNull();
  });

  it("re-throws transient EIO error from EPUB parsing instead of marking unparseable", async () => {
    const state = createEmptyState("/tmp/root");
    const epubAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/book.epub",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "book.epub",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "epub",
      fullHash: "hash",
      id: "file-1",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.EPUB,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/book.epub",
      sizeBytes: 100n,
    };
    state.fileAssets.set(epubAsset.absolutePath, epubAsset);
    state.fileAssetsById.set(epubAsset.id, epubAsset);

    const error = new Error("EIO: i/o error, read") as NodeJS.ErrnoException;
    error.code = "EIO";

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseEpub: vi.fn(async () => {
        await Promise.resolve();
        throw error;
      }),
    });

    await expect(
      services.parseFileAssetMetadata({
        fileAssetId: "file-1",
        now: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("EIO");

    expect(state.fileAssetsById.get("file-1")?.metadata).toBeNull();
  });

  it("re-throws transient ECONNRESET error from OPF parsing instead of marking unparseable", async () => {
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

    const error = new Error("ECONNRESET: connection reset by peer") as NodeJS.ErrnoException;
    error.code = "ECONNRESET";

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseOpf: vi.fn(async () => {
        await Promise.resolve();
        throw error;
      }),
    });

    await expect(
      services.parseFileAssetMetadata({
        fileAssetId: "file-opf",
        now: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("ECONNRESET");

    expect(state.fileAssetsById.get("file-opf")?.metadata).toBeNull();
  });

  it("re-throws transient ETIMEDOUT error from audiobook metadata.json parsing instead of marking unparseable", async () => {
    const state = createEmptyState("/tmp/root");
    const jsonAsset: TestFileAsset = {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: "metadata.json",
      ctime: new Date("2024-01-01T00:00:00.000Z"),
      extension: "json",
      fullHash: "hash",
      id: "file-json",
      lastSeenAt: null,
      libraryRootId: "root-1",
      mediaKind: MediaKind.SIDECAR,
      metadata: null,
      mtime: new Date("2024-01-01T00:00:00.000Z"),
      partialHash: "phash",
      relativePath: "Author/Book/metadata.json",
      sizeBytes: 100n,
    };
    state.fileAssets.set(jsonAsset.absolutePath, jsonAsset);
    state.fileAssetsById.set(jsonAsset.id, jsonAsset);

    const error = new Error("ETIMEDOUT: connection timed out") as NodeJS.ErrnoException;
    error.code = "ETIMEDOUT";

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
      parseAudiobookJson: vi.fn(async () => {
        await Promise.resolve();
        throw error;
      }),
    });

    await expect(
      services.parseFileAssetMetadata({
        fileAssetId: "file-json",
        now: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("ETIMEDOUT");

    expect(state.fileAssetsById.get("file-json")?.metadata).toBeNull();
  });

  it("handles encoding error on standalone audio as parsed with warnings", async () => {
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
          tags: {
            title: undefined,
            album: undefined,
            artist: undefined,
            albumArtist: undefined,
            year: undefined,
            genres: [],
            comment: undefined,
            trackNumber: undefined,
            trackTotal: undefined,
          },
          warnings: ["unsupported Unicode escape sequence"],
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
      warnings: ["unsupported Unicode escape sequence"],
    });
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "file-1" },
    );
    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      expect.anything(),
    );
  });

  it("enqueues MATCH_SUGGESTIONS directly when audio ID3 has no title and no authors", async () => {
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
          tags: {
            title: undefined,
            album: undefined,
            artist: undefined,
            albumArtist: undefined,
            year: undefined,
            genres: [],
            comment: undefined,
            trackNumber: undefined,
            trackTotal: undefined,
          },
          warnings: [],
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
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "file-1" },
    );
  });

  it("enqueues MATCH_SUGGESTIONS directly when audio ID3 has title but no authors", async () => {
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
          tags: {
            title: undefined,
            album: "Project Hail Mary",
            artist: undefined,
            albumArtist: undefined,
            year: undefined,
            genres: [],
            comment: undefined,
            trackNumber: undefined,
            trackTotal: undefined,
          },
          warnings: [],
        };
      }),
    });

    await services.parseFileAssetMetadata({
      fileAssetId: "file-1",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_FILE_ASSET_TO_EDITION,
      expect.anything(),
    );
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "file-1" },
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
      } as object as FileAsset["metadata"],
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

  it("reuses existing audiobook stub work when sidecar matches by title but stub has no authors", async () => {
    const state = createEmptyState("/tmp/root");

    // Pre-existing stub work (created by SCAN) with no authors
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "stub-edition",
      workId: "stub-work",
    });

    // Audio file already linked to the stub edition (created during SCAN)
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/book.m4b",
      basename: "book.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Author/Book/book.m4b",
    });
    addEditionFile(state, {
      editionId: "stub-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    // metadata.json sidecar with full metadata
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          narrators: ["Ray Porter"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Should reuse existing stub work, not create a new one
    expect(result).toMatchObject({
      createdEdition: false,
      createdWork: false,
      skipped: false,
    });
    expect(result.workId).toBe("stub-work");
    expect(result.editionId).toBe("stub-edition");

    // Stub should be enriched
    const enrichedWork = state.works.get("stub-work");
    expect(enrichedWork?.enrichmentStatus).toBe("ENRICHED");
    expect(enrichedWork?.titleDisplay).toBe("Project Hail Mary");

    // Should NOT create a second edition — should enrich the existing stub edition
    const editions = [...state.editions.values()].filter((e) => e.workId === "stub-work");
    expect(editions).toHaveLength(1);
    expect(editions[0]?.id).toBe("stub-edition");

    // Sidecar should be linked to the existing stub edition
    const sidecarLink = [...state.editionFiles.values()].find(
      (ef) => ef.fileAssetId === "file-sidecar" && ef.editionId === "stub-edition",
    );
    expect(sidecarLink).toBeDefined();

    // Existing stub edition should have authors from sidecar
    const authorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.AUTHOR,
    );
    expect(authorLinks).toHaveLength(1);
    const firstAuthor = authorLinks[0];
    expect(firstAuthor).toBeDefined();
    const authorContributor = state.contributors.get(firstAuthor?.contributorId ?? "");
    expect(authorContributor?.nameDisplay).toBe("Andy Weir");

    // Existing stub edition should have narrators from sidecar
    const narratorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.NARRATOR,
    );
    expect(narratorLinks).toHaveLength(1);
    const firstNarrator = narratorLinks[0];
    expect(firstNarrator).toBeDefined();
    const narratorContributor = state.contributors.get(firstNarrator?.contributorId ?? "");
    expect(narratorContributor?.nameDisplay).toBe("Ray Porter");
  });

  it("enriches existing audiobook stub edition when sidecar title differs from directory-derived title", async () => {
    const state = createEmptyState("/tmp/root");

    // Pre-existing stub work created by SCAN with directory-derived title
    // Directory is "The One Device - The Secret History of the iPhone"
    // but metadata.json says "The One Device: The Secret History of the iPhone"
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "one device secret history of iphone",
      titleDisplay: "The One Device - The Secret History of the iPhone",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "stub-edition",
      workId: "stub-work",
    });

    // Audio file already linked to the stub edition (created during SCAN)
    addFileAsset(state, {
      absolutePath: "/tmp/root/Brian Merchant/The One Device - The Secret History of the iPhone/book.m4b",
      basename: "book.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Brian Merchant/The One Device - The Secret History of the iPhone/book.m4b",
    });
    addEditionFile(state, {
      editionId: "stub-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    // metadata.json sidecar with DIFFERENT title than directory
    addFileAsset(state, {
      absolutePath: "/tmp/root/Brian Merchant/The One Device - The Secret History of the iPhone/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Brian Merchant/The One Device - The Secret History of the iPhone/metadata.json",
      metadata: {
        normalized: {
          authors: ["Brian Merchant"],
          narrators: ["Foster Jones"],
          identifiers: { unknown: [] },
          title: "The One Device: The Secret History of the iPhone",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Should reuse existing stub work, not create a new one
    expect(result).toMatchObject({
      createdEdition: false,
      createdWork: false,
      skipped: false,
    });
    expect(result.workId).toBe("stub-work");
    expect(result.editionId).toBe("stub-edition");

    // Should NOT create a second edition
    const editions = [...state.editions.values()].filter((e) => e.workId === "stub-work");
    expect(editions).toHaveLength(1);

    // Stub should be enriched with sidecar's better title
    const enrichedWork = state.works.get("stub-work");
    expect(enrichedWork?.enrichmentStatus).toBe("ENRICHED");

    // Sidecar should be linked to the existing stub edition
    const sidecarLink = [...state.editionFiles.values()].find(
      (ef) => ef.fileAssetId === "file-sidecar" && ef.editionId === "stub-edition",
    );
    expect(sidecarLink).toBeDefined();

    // Authors and narrators from sidecar should be on the existing edition
    const authorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.AUTHOR,
    );
    expect(authorLinks).toHaveLength(1);

    const narratorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.NARRATOR,
    );
    expect(narratorLinks).toHaveLength(1);
  });

  it("enriches existing audiobook edition via directory match when work is already ENRICHED", async () => {
    const state = createEmptyState("/tmp/root");

    addWork(state, {
      enrichmentStatus: "ENRICHED",
      id: "enriched-work",
      titleCanonical: "some book",
      titleDisplay: "Some Book",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "audio-edition",
      workId: "enriched-work",
    });

    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Some Book/book.m4b",
      basename: "book.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Author/Some Book/book.m4b",
    });
    addEditionFile(state, {
      editionId: "audio-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Some Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Some Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Author Name"],
          narrators: [],
          identifiers: { asin: "B001234" },
          title: "Some Book",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    expect(result).toMatchObject({
      createdEdition: false,
      createdWork: false,
      skipped: false,
      editionId: "audio-edition",
      workId: "enriched-work",
    });

    // Work should still be ENRICHED, not changed
    const work = state.works.get("enriched-work");
    expect(work?.enrichmentStatus).toBe("ENRICHED");

    // Edition should have the ASIN from the sidecar
    const edition = state.editions.get("audio-edition");
    expect(edition?.asin).toBe("B001234");
  });

  it("falls through directory match when sibling edition is not AUDIOBOOK", async () => {
    const state = createEmptyState("/tmp/root");

    // A stub audiobook work that the sidecar should find via title fallback
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "some book",
      titleDisplay: "Some Book",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "audio-edition",
      workId: "stub-work",
    });

    // An EBOOK edition also linked to an audio file in the same directory as the sidecar.
    // This simulates a non-AUDIOBOOK edition being found by the directory lookup.
    addWork(state, {
      enrichmentStatus: "ENRICHED",
      id: "ebook-work",
      titleCanonical: "other book",
      titleDisplay: "Other Book",
    });
    addEdition(state, {
      formatFamily: FormatFamily.EBOOK,
      id: "ebook-edition",
      workId: "ebook-work",
    });

    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Some Book/book.mp3",
      basename: "book.mp3",
      extension: "mp3",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Author/Some Book/book.mp3",
    });
    // Link the audio file to the EBOOK edition (not AUDIOBOOK) — triggers the branch
    addEditionFile(state, {
      editionId: "ebook-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    // Sidecar in the same directory as the audio file
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Some Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Some Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Author Name"],
          narrators: [],
          identifiers: { unknown: [] },
          title: "Some Book",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Directory lookup found the audio file but its edition is EBOOK, not AUDIOBOOK.
    // Falls through to title-based match, which finds stub-work and enriches it.
    expect(result.skipped).toBe(false);
    expect(result.createdEdition).toBe(false);
    expect(result.workId).toBe("stub-work");
    expect(result.editionId).toBe("audio-edition");
  });

  it("falls through directory match when sibling audiobook edition has a deleted work", async () => {
    const state = createEmptyState("/tmp/root");

    // A stub work for the sidecar to find via title fallback
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "fallback-work",
      titleCanonical: "orphan book",
      titleDisplay: "Orphan Book",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "fallback-edition",
      workId: "fallback-work",
    });

    // An AUDIOBOOK edition whose work no longer exists (orphaned)
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "orphan-edition",
      workId: "deleted-work", // this work doesn't exist
    });

    // Audio file linked to the orphaned edition, in the same directory as the sidecar
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Orphan Book/track.m4b",
      basename: "track.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Author/Orphan Book/track.m4b",
    });
    addEditionFile(state, {
      editionId: "orphan-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    // Sidecar in the same directory
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Orphan Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Orphan Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Author Name"],
          narrators: [],
          identifiers: { unknown: [] },
          title: "Orphan Book",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Directory lookup found the audio file, edition is AUDIOBOOK, but work is missing.
    // Should continue to the next sibling or fall through to title-based match.
    expect(result.skipped).toBe(false);
    expect(result.workId).toBe("fallback-work");
    expect(result.editionId).toBe("fallback-edition");
  });

  it("enriches existing audiobook stub edition without narrators when sidecar has none", async () => {
    const state = createEmptyState("/tmp/root");

    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "stub-edition",
      workId: "stub-work",
    });
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/book.m4b",
      basename: "book.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Author/Book/book.m4b",
    });
    addEditionFile(state, {
      editionId: "stub-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    expect(result).toMatchObject({ createdEdition: false, skipped: false });
    expect(result.editionId).toBe("stub-edition");
    // No narrator links created
    const narratorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.NARRATOR,
    );
    expect(narratorLinks).toHaveLength(0);
  });

  it("enriches existing audiobook stub edition via title-based fallback when sidecar is in a different directory", async () => {
    const state = createEmptyState("/tmp/root");

    // Pre-existing stub work (created by SCAN) with no authors
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });
    addEdition(state, {
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "stub-edition",
      workId: "stub-work",
    });

    // Audio file linked to the stub edition — in directory A
    addFileAsset(state, {
      absolutePath: "/tmp/root/Audiobooks/Project Hail Mary/book.m4b",
      basename: "book.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Audiobooks/Project Hail Mary/book.m4b",
    });
    addEditionFile(state, {
      editionId: "stub-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    // metadata.json sidecar in directory B (different from audio file)
    // The directory-based lookup won't find sibling audio files here
    addFileAsset(state, {
      absolutePath: "/tmp/root/Sidecars/Project Hail Mary/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Sidecars/Project Hail Mary/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          narrators: ["Ray Porter"],
          identifiers: { asin: "B08G9PRS1K", unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const enqueueLibraryJob = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Should reuse existing stub work and edition (title-based fallback)
    expect(result).toMatchObject({
      createdEdition: false,
      createdEditionFile: true,
      createdWork: false,
      enrichedExistingWork: true,
      enqueuedCoverJob: true,
      skipped: false,
    });
    expect(result.workId).toBe("stub-work");
    expect(result.editionId).toBe("stub-edition");

    // Stub should be enriched
    const enrichedWork = state.works.get("stub-work");
    expect(enrichedWork?.enrichmentStatus).toBe("ENRICHED");
    expect(enrichedWork?.titleDisplay).toBe("Project Hail Mary");

    // Edition should have ASIN from sidecar
    const enrichedEdition = state.editions.get("stub-edition");
    expect(enrichedEdition?.asin).toBe("B08G9PRS1K");

    // Should NOT create a second edition
    const editions = [...state.editions.values()].filter((e) => e.workId === "stub-work");
    expect(editions).toHaveLength(1);

    // Sidecar should be linked to the existing stub edition
    const sidecarLink = [...state.editionFiles.values()].find(
      (ef) => ef.fileAssetId === "file-sidecar" && ef.editionId === "stub-edition",
    );
    expect(sidecarLink).toBeDefined();

    // Authors from sidecar should be on the existing edition
    const authorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.AUTHOR,
    );
    expect(authorLinks).toHaveLength(1);
    const authorContributor = state.contributors.get(authorLinks[0]?.contributorId ?? "");
    expect(authorContributor?.nameDisplay).toBe("Andy Weir");

    // Narrators from sidecar should be on the existing edition
    const narratorLinks2 = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.NARRATOR,
    );
    expect(narratorLinks2).toHaveLength(1);
    const narratorContributor = state.contributors.get(narratorLinks2[0]?.contributorId ?? "");
    expect(narratorContributor?.nameDisplay).toBe("Ray Porter");

    // Cover job should be enqueued
    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workId: "stub-work", fileAssetId: "file-sidecar" }),
    );
  });

  it("title-based fallback preserves existing ASIN and skips narrators when sidecar has none", async () => {
    const state = createEmptyState("/tmp/root");

    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "some title",
      titleDisplay: "Some Title",
    });
    addEdition(state, {
      asin: "EXISTING_ASIN",
      formatFamily: FormatFamily.AUDIOBOOK,
      id: "stub-edition",
      workId: "stub-work",
    });

    addFileAsset(state, {
      absolutePath: "/tmp/root/Audio/Some Title/book.m4b",
      basename: "book.m4b",
      extension: "m4b",
      fullHash: "audiohash",
      id: "file-audio",
      mediaKind: MediaKind.AUDIO,
      relativePath: "Audio/Some Title/book.m4b",
    });
    addEditionFile(state, {
      editionId: "stub-edition",
      fileAssetId: "file-audio",
      id: "ef-audio",
      role: EditionFileRole.AUDIO_TRACK,
    });

    // Sidecar in different directory — forces title-based fallback
    // Has no narrators, no ASIN (so existing ASIN should be preserved)
    addFileAsset(state, {
      absolutePath: "/tmp/root/Sidecars/Some Title/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Sidecars/Some Title/metadata.json",
      metadata: {
        normalized: {
          authors: ["Author Name"],
          narrators: [],
          identifiers: { unknown: [] },
          title: "Some Title",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    expect(result).toMatchObject({ createdEdition: false, skipped: false });
    expect(result.editionId).toBe("stub-edition");

    // Existing ASIN should be preserved (sidecar had no ASIN)
    const edition = state.editions.get("stub-edition");
    expect(edition?.asin).toBe("EXISTING_ASIN");

    // No narrator contributors should be created
    const narratorLinks = [...state.editionContributors.values()].filter(
      (ec) => ec.editionId === "stub-edition" && ec.role === ContributorRole.NARRATOR,
    );
    expect(narratorLinks).toHaveLength(0);
  });

  it("creates new ebook edition on stub work without checking for existing editions", async () => {
    const state = createEmptyState("/tmp/root");

    // Stub work with an existing ebook edition that has an author
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });
    addEdition(state, {
      formatFamily: FormatFamily.EBOOK,
      id: "existing-edition",
      workId: "stub-work",
    });
    addContributor(state, {
      id: "existing-author",
      nameCanonical: "andy weir",
      nameDisplay: "Andy Weir",
    });
    addEditionContributor(state, {
      contributorId: "existing-author",
      editionId: "existing-edition",
      id: "ec-existing",
    });

    // Second EPUB with same title+author
    addFileAsset(state, {
      absolutePath: "/tmp/root/Andy Weir/Project Hail Mary (2).epub",
      basename: "Project Hail Mary (2).epub",
      extension: "epub",
      id: "file-epub2",
      mediaKind: MediaKind.EPUB,
      relativePath: "Andy Weir/Project Hail Mary (2).epub",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "epub",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-epub2" });

    // Ebooks always create new editions (no audiobook-style dedup)
    expect(result).toMatchObject({ createdEdition: true, createdWork: false, skipped: false });
    expect(result.workId).toBe("stub-work");
    // Stub should be enriched
    expect(state.works.get("stub-work")?.enrichmentStatus).toBe("ENRICHED");
  });

  it("creates new audiobook edition when stub work has no existing audiobook edition", async () => {
    const state = createEmptyState("/tmp/root");

    // Stub work exists but has NO editions at all
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });

    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Should create a new edition since the stub has no audiobook edition
    expect(result).toMatchObject({ createdEdition: true, createdWork: false, skipped: false });
    expect(result.workId).toBe("stub-work");
  });

  it("does not reuse non-stub work with matching title but no authors", async () => {
    const state = createEmptyState("/tmp/root");

    // Pre-existing ENRICHED work (not a stub) with no authors
    addWork(state, {
      enrichmentStatus: "ENRICHED",
      id: "enriched-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });

    // metadata.json sidecar with authors
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Should create a new work since the existing one is not a stub
    expect(result).toMatchObject({
      createdWork: true,
      skipped: false,
    });
    expect(result.workId).not.toBe("enriched-work");
  });

  it("prefers author-matched work over stub fallback", async () => {
    const state = createEmptyState("/tmp/root");

    // Stub work with no authors
    addWork(state, {
      enrichmentStatus: "STUB",
      id: "stub-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });

    // Enriched work with matching authors
    addWork(state, {
      enrichmentStatus: "ENRICHED",
      id: "author-work",
      titleCanonical: "project hail mary",
      titleDisplay: "Project Hail Mary",
    });
    addEdition(state, {
      id: "author-edition",
      workId: "author-work",
    });
    addContributor(state, {
      id: "c-weir",
      nameCanonical: "andy weir",
      nameDisplay: "Andy Weir",
    });
    addEditionContributor(state, {
      contributorId: "c-weir",
      editionId: "author-edition",
      id: "ec-weir",
    });

    // metadata.json sidecar
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });

    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    // Should use the author-matched work, not the stub
    expect(result).toMatchObject({
      createdWork: false,
      skipped: false,
    });
    expect(result.workId).toBe("author-work");
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
      } as object as FileAsset["metadata"],
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
          tags: {
            title: "Chapter 01",
            album: "Test Book",
            artist: "Author",
            albumArtist: "Author",
            year: 2021,
            genres: [],
            comment: undefined,
            trackNumber: 1,
            trackTotal: 5,
          },
          warnings: [],
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
          tags: {
            title: undefined,
            album: "The Book",
            artist: "Artist Only",
            albumArtist: undefined,
            year: undefined,
            genres: [],
            comment: undefined,
            trackNumber: undefined,
            trackTotal: undefined,
          },
          warnings: [],
        };
      }),
    });

    const result = await services.parseFileAssetMetadata({
      fileAssetId: "file-audio",
      now: new Date("2025-01-01T00:00:00.000Z"),
    });

    expect(result.skipped).toBe(false);
    const metadata = state.fileAssetsById.get("file-audio")?.metadata as Prisma.JsonObject;
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

describe("matchFileAssetToEdition enqueues follow-up jobs", () => {
  it("enqueues detect-duplicates and match-audio after a successful match", async () => {
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
    expect(enqueueMock).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      { fileAssetId: "file-1" },
    );
  });

  it("returns mediaKind in the result for a successful EPUB match", async () => {
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
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(() => Promise.resolve(undefined)),
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-1" });

    expect(result.skipped).toBe(false);
    expect(result.mediaKind).toBe("EPUB");
  });

  it("does not enqueue follow-up jobs when match is skipped", async () => {
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
    expect(enqueueMock).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      expect.anything(),
    );
  });

  it("does not enqueue DETECT_DUPLICATES or MATCH_SUGGESTIONS for a SIDECAR file asset", async () => {
    const state = createEmptyState("/tmp/root");
    addFileAsset(state, {
      absolutePath: "/tmp/root/Author/Book/metadata.json",
      basename: "metadata.json",
      extension: "json",
      id: "file-sidecar",
      mediaKind: MediaKind.SIDECAR,
      relativePath: "Author/Book/metadata.json",
      metadata: {
        normalized: {
          authors: ["Andy Weir"],
          narrators: ["Ray Porter"],
          identifiers: { unknown: [] },
          title: "Project Hail Mary",
        },
        parsedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        parserVersion: 1,
        source: "audiobook-json",
        status: "parsed",
        warnings: [],
      } as object as FileAsset["metadata"],
    });
    const enqueueMock = vi.fn(() => Promise.resolve(undefined));
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: enqueueMock,
    });

    const result = await services.matchFileAssetToEdition({ fileAssetId: "file-sidecar" });

    expect(result.skipped).toBe(false);
    expect(result.mediaKind).toBe("SIDECAR");
    expect(enqueueMock).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.DETECT_DUPLICATES,
      expect.anything(),
    );
    expect(enqueueMock).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS,
      expect.anything(),
    );
  });
});

describe("detectDuplicates", () => {
  const now = new Date("2025-01-01");

  function addDetectFileAsset(state: TestState, id: string, hash: string | null, absPath: string, overrides: Partial<TestFileAsset> = {}) {
    const fa: TestFileAsset = {
      absolutePath: absPath,
      availabilityStatus: AvailabilityStatus.PRESENT,
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
      ...overrides,
    };
    state.fileAssetsById.set(id, fa);
    state.fileAssets.set(absPath, fa);
    return fa;
  }

  function addDetectEdition(state: TestState, id: string, workId: string, overrides: Partial<TestEdition> = {}) {
    const ed: TestEdition = {
      asin: null,
      formatFamily: FormatFamily.EBOOK,
      id,
      isbn10: null,
      isbn13: null,
      language: null,
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
      coverPath: null,
      description: null,
      enrichmentStatus: "STUB" as EnrichmentStatus,
      id,
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
    addDetectFileAsset(state, "file-2", "hash-b", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book a", "Book A");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectEditionFile(state, "ef-2", "edition-2", "file-2");
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
    addDetectFileAsset(state, "file-2", "hash-b", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book a", "Book A");
    addDetectEdition(state, "edition-1", "work-1", { isbn10: "1234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn10: "1234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectEditionFile(state, "ef-2", "edition-2", "file-2");
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
    addDetectFileAsset(state, "file-2", "hash-b", "/tmp/root/book-copy.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book a", "Book A");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectEditionFile(state, "ef-2", "edition-2", "file-2");
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

  it("SAME_ISBN: does not create candidate when editions have different formatFamily", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book a audiobook", "Book A Audiobook");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890", formatFamily: FormatFamily.EBOOK });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890", formatFamily: FormatFamily.AUDIOBOOK });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
    expect(state.duplicateCandidates.size).toBe(0);
  });

  it("SAME_ISBN: creates candidate when matched edition has no files", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "book a", "Book A");
    addDetectWork(state, "work-2", "book a", "Book A");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    // edition-2 has no edition files
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(1);
  });

  it("SAME_ISBN: does not create candidate when matched edition belongs to a different work (ISBN collision)", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectWork(state, "work-1", "restaurant at the end of the universe", "The Restaurant at the End of the Universe");
    addDetectWork(state, "work-2", "the ultimate hitchhikers guide", "The Ultimate Hitchhiker's Guide");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9780307498465" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9780307498465" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
    expect(state.duplicateCandidates.size).toBe(0);
  });

  it("SAME_ISBN: does not create candidate when matched edition has no overlapping file media kinds", async () => {
    const state = createEmptyState();
    addDetectFileAsset(state, "file-1", "hash-a", "/tmp/root/book.epub");
    addDetectFileAsset(state, "file-2", null, "/tmp/root/book.pdf", { mediaKind: MediaKind.PDF });
    addDetectWork(state, "work-1", "hijacked", "Hijacked");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781009275439" });
    addDetectEdition(state, "edition-2", "work-1", { isbn13: "9781009275439" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectEditionFile(state, "ef-2", "edition-2", "file-2");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.detectDuplicates({ fileAssetId: "file-1" });

    expect(result.candidatesCreated).toBe(0);
    expect(state.duplicateCandidates.size).toBe(0);
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
    const candidate = candidates[0];
    expect(candidate).toMatchObject({
      leftEditionId: "edition-1",
      rightEditionId: "edition-2",
      reason: "SIMILAR_TITLE_AUTHOR",
    });
    expect(candidate?.confidence).toBeGreaterThanOrEqual(0.85);
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
    addDetectFileAsset(state, "file-3", null, "/tmp/root/book-isbn.epub");
    addDetectWork(state, "work-1", "book title", "Book Title");
    addDetectWork(state, "work-2", "book title", "Book Title");
    addDetectEdition(state, "edition-1", "work-1", { isbn13: "9781234567890" });
    addDetectEdition(state, "edition-2", "work-2", { isbn13: "9781234567890" });
    addDetectEditionFile(state, "ef-1", "edition-1", "file-1");
    addDetectEditionFile(state, "ef-2", "edition-2", "file-3");
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

describe("matchSuggestions", () => {
  const now = new Date("2025-01-01");

  function getFirstMatchSuggestion(state: TestState): TestMatchSuggestion {
    const link = [...state.matchSuggestions.values()][0];
    if (!link) throw new Error("expected at least one audio link");
    return link;
  }

  function addAudioFileAsset(state: TestState, id: string, absPath: string, mediaKind: MediaKind = MediaKind.EPUB) {
    const fa: TestFileAsset = {
      absolutePath: absPath,
      availabilityStatus: AvailabilityStatus.PRESENT,
      basename: path.basename(absPath),
      ctime: now,
      extension: path.extname(absPath) || null,
      fullHash: null,
      id,
      lastSeenAt: now,
      libraryRootId: "root-1",
      mediaKind,
      metadata: null,
      mtime: now,
      partialHash: null,
      relativePath: absPath.replace("/tmp/root/", ""),
      sizeBytes: BigInt(1000),
    };
    state.fileAssetsById.set(id, fa);
    state.fileAssets.set(absPath, fa);
    return fa;
  }

  function addAudioWork(state: TestState, id: string, titleCanonical: string, titleDisplay: string) {
    const w: TestWork = {
      coverPath: null,
      description: null,
      enrichmentStatus: "STUB" as EnrichmentStatus,
      id,
      seriesId: null,
      seriesPosition: null,
      sortTitle: null,
      titleCanonical,
      titleDisplay,
    };
    state.works.set(id, w);
    return w;
  }

  function addAudioEdition(state: TestState, id: string, workId: string, overrides: Partial<TestEdition> = {}) {
    const ed: TestEdition = {
      asin: null,
      formatFamily: FormatFamily.EBOOK,
      id,
      isbn10: null,
      isbn13: null,
      language: null,
      publishedAt: null,
      publisher: null,
      workId,
      ...overrides,
    };
    state.editions.set(id, ed);
    return ed;
  }

  function addAudioEditionFile(state: TestState, efId: string, editionId: string, fileAssetId: string) {
    state.editionFiles.set(getEditionFileKey(editionId, fileAssetId), {
      editionId,
      fileAssetId,
      id: efId,
      role: EditionFileRole.PRIMARY,
    });
  }

  function addAudioContributor(state: TestState, id: string, name: string) {
    const c: TestContributor = { id, nameCanonical: name.toLowerCase(), nameDisplay: name };
    state.contributors.set(id, c);
    state.contributorsByCanonical.set(c.nameCanonical, c);
    return c;
  }

  function addAudioEditionContributor(state: TestState, ecId: string, editionId: string, contributorId: string) {
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

    const result = await services.matchSuggestions({ fileAssetId: "nonexistent" });

    expect(result).toEqual({ fileAssetId: "nonexistent", skipped: true, linksCreated: 0 });
  });

  it("skips when file asset has no linked edition file", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-1", "/tmp/root/book.epub");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.matchSuggestions({ fileAssetId: "file-1" });

    expect(result).toEqual({ fileAssetId: "file-1", skipped: true, linksCreated: 0 });
  });

  it("skips when edition is not found", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-1", "/tmp/root/book.epub");
    addAudioEditionFile(state, "ef-1", "missing-edition", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.matchSuggestions({ fileAssetId: "file-1" });

    expect(result).toEqual({ fileAssetId: "file-1", skipped: true, linksCreated: 0 });
  });

  it("creates PENDING MatchSuggestion when audiobook matches ebook on different works", async () => {
    const state = createEmptyState();
    // Audiobook file and edition
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook file and edition
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.skipped).toBe(false);
    expect(result.linksCreated).toBe(1);
    // Works are NOT merged — both still exist
    expect(state.works.has("work-ebook")).toBe(true);
    expect(state.works.has("work-audio")).toBe(true);
    // Edition stays on its original work
    expect(state.editions.get("edition-audio")?.workId).toBe("work-audio");
    // Link created with work IDs
    const link = getFirstMatchSuggestion(state);
    expect(link.targetWorkId).toBe("work-ebook");
    expect(link.suggestedWorkId).toBe("work-audio");
    expect(link.matchType).toBe("SAME_WORK");
  });

  it("creates PENDING MatchSuggestion when ebook matches audiobook on different works", async () => {
    const state = createEmptyState();
    // Ebook file triggers the match
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");
    // Audiobook already exists
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-ebook" });

    expect(result.skipped).toBe(false);
    expect(result.linksCreated).toBe(1);
    // Works are NOT merged — both still exist
    expect(state.works.has("work-ebook")).toBe(true);
    expect(state.works.has("work-audio")).toBe(true);
    // Edition stays on its original work
    expect(state.editions.get("edition-audio")?.workId).toBe("work-audio");
    const link = getFirstMatchSuggestion(state);
    expect(link.targetWorkId).toBe("work-ebook");
    expect(link.suggestedWorkId).toBe("work-audio");
    expect(link.matchType).toBe("SAME_WORK");
  });

  it("does not create link when title similarity below threshold", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook with very different title
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/moby-dick.epub");
    addAudioWork(state, "work-ebook", "moby dick", "Moby Dick");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Herman Melville");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(0);
  });

  it("does not create link when author similarity below threshold", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook with same title but different author
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Completely Different Author");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(0);
  });

  it("does not create duplicate link when work pair already exists", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");
    // Pre-existing link with work IDs
    state.matchSuggestions.set("existing", {
      id: "existing",
      targetWorkId: "work-ebook",
      suggestedWorkId: "work-audio",
      matchType: "EXACT_METADATA",
      confidence: 1.0,
      reviewStatus: "PENDING",
    });

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // No new link created (already exists), no merge
    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(1);
    // Works are NOT merged
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
  });

  it("does not create MatchSuggestion when editions share the same work", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-shared", "the great gatsby", "The Great Gatsby");
    // Both editions share the same work — already colocated
    addAudioEdition(state, "edition-audio", "work-shared", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEdition(state, "edition-ebook", "work-shared", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-1", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-1");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-1");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // Same-work editions don't need an MatchSuggestion
    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(0);
  });

  it("uses SAME_WORK matchType for cross-work match with matching titles and authors", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("SAME_WORK");
    // Works are NOT merged
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
  });

  it("applies filename similarity boost for cross-work match", async () => {
    const state = createEmptyState();
    // Same basename pattern (gatsby.m4b vs gatsby.epub)
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/the-great-gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/the-great-gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.confidence).toBeGreaterThan(0.85);
  });

  it("applies folder proximity boost for cross-work match", async () => {
    const state = createEmptyState();
    // Files in sibling directories (same grandparent)
    addAudioFileAsset(state, "file-audio", "/tmp/root/books/audio/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    addAudioFileAsset(state, "file-ebook", "/tmp/root/books/ebook/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.confidence).toBeLessThanOrEqual(1.0);
  });

  it("caps confidence at 1.0 after boosts for cross-work match", async () => {
    const state = createEmptyState();
    // Same directory and same filename pattern — both boosts apply
    addAudioFileAsset(state, "file-audio", "/tmp/root/books/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    addAudioFileAsset(state, "file-ebook", "/tmp/root/books/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    // Base confidence 1.0 + 0.05 (filename) + 0.05 (folder) = 1.1, capped at 1.0
    expect(link.confidence).toBe(1.0);
  });

  it("skips editions of the same format family", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Other work has AUDIOBOOK edition, not EBOOK
    addAudioFileAsset(state, "file-audio2", "/tmp/root/audiobooks/gatsby2.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio2", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio2", "work-audio2", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio2", "edition-audio2", "file-audio2");
    addAudioContributor(state, "c-audio2", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio2", "edition-audio2", "c-audio2");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
  });

  it("skips when work has no titleCanonical", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "", "");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result).toEqual({ fileAssetId: "file-audio", skipped: true, linksCreated: 0 });
  });

  it("creates link without boosts when other edition has no file", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook with NO edition file link
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.confidence).toBe(1.0);
    // Works are NOT merged
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
  });

  it("creates link without boosts when other edition file has dangling file asset", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook with edition file pointing to missing file asset
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "missing-file");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.confidence).toBe(1.0);
    // Works are NOT merged
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
  });

  it("skips other work with no titleCanonical in cross-work matching", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Other work with empty titleCanonical
    addAudioWork(state, "work-ebook", "", "");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
  });

  it("creates link without boosts when filenames differ and folders are far apart", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/data/audiobooks/collection/my-audiobook-file.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook with very different filename and distant directory
    addAudioFileAsset(state, "file-ebook", "/media/ebooks/library/completely-different-name.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.confidence).toBe(1.0);
    // Works are NOT merged
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
  });

  it("skips when edition format is neither EBOOK nor AUDIOBOOK", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-1", "/tmp/root/other/file.cbz");
    addAudioWork(state, "work-1", "some title", "Some Title");
    // Use a format that is not EBOOK or AUDIOBOOK — but FormatFamily only has those two,
    // so we cast to test the defensive branch
    addAudioEdition(state, "edition-1", "work-1", { formatFamily: "OTHER" as FormatFamily });
    addAudioEditionFile(state, "ef-1", "edition-1", "file-1");
    const services = createIngestServices({ db: createTestDb(state) });

    const result = await services.matchSuggestions({ fileAssetId: "file-1" });

    expect(result).toEqual({ fileAssetId: "file-1", skipped: true, linksCreated: 0 });
  });

  it("matches when both works have no authors if titles are exact", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    // No authors
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    // No authors

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("TITLE_ONLY");
  });

  it("does not reconcile metadata during matchSuggestions — creates link only", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    const audioWork = addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    audioWork.description = "A novel about the American Dream";
    const audioEdition = addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    audioEdition.language = "en";
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook work has null description; ebook edition has null language
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // Link created but no merge — works stay separate
    expect(result.linksCreated).toBe(1);
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
    // Ebook work does NOT get metadata from audiobook work (no merge)
    const ebookWork = state.works.get("work-ebook");
    expect(ebookWork?.description).toBeNull();
    const ebookEdition = state.editions.get("edition-ebook");
    expect(ebookEdition?.language).toBeNull();
  });

  it("preserves both works metadata during matchSuggestions — no merge", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    const audioWork = addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    audioWork.description = "Audio description";
    audioWork.coverPath = "/covers/audio.jpg";
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // Ebook work already has description and cover
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    const ebookWork = addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    ebookWork.description = "Ebook description";
    ebookWork.coverPath = "/covers/ebook.jpg";
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    // Both works keep their own metadata — no merge
    const survivingEbook = state.works.get("work-ebook");
    expect(survivingEbook?.description).toBe("Ebook description");
    expect(survivingEbook?.coverPath).toBe("/covers/ebook.jpg");
    const survivingAudio = state.works.get("work-audio");
    expect(survivingAudio?.description).toBe("Audio description");
    expect(survivingAudio?.coverPath).toBe("/covers/audio.jpg");
  });

  it("creates one link for cross-work match with multiple audiobook editions", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio1", "/tmp/root/audiobooks/gatsby-part1.m4b", MediaKind.AUDIO);
    addAudioFileAsset(state, "file-audio2", "/tmp/root/audiobooks/gatsby-part2.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio1", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEdition(state, "edition-audio2", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio1", "edition-audio1", "file-audio1");
    addAudioEditionFile(state, "ef-audio2", "edition-audio2", "file-audio2");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio1", "edition-audio1", "c-audio");
    addAudioEditionContributor(state, "ec-audio2", "edition-audio2", "c-audio");
    // Ebook
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio1" });

    // Editions stay on their original works — no merge
    expect(state.editions.get("edition-audio1")?.workId).toBe("work-audio");
    expect(state.editions.get("edition-audio2")?.workId).toBe("work-audio");
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
    // One link created between the two works
    expect(result.linksCreated).toBe(1);
  });

  it("creates no links when no cross-work match found", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");
    // No ebook exists

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
  });

  it("creates TITLE_ONLY link for audiobook stub (no authors) with ebook by exact title match", async () => {
    const state = createEmptyState();
    // Audiobook stub with no authors
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    // No authors on audiobook
    // Ebook with authors
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.skipped).toBe(false);
    expect(result.linksCreated).toBe(1);
    // Works are NOT merged — both still exist
    expect(state.works.has("work-ebook")).toBe(true);
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.editions.get("edition-audio")?.workId).toBe("work-audio");
    const link = getFirstMatchSuggestion(state);
    expect(link.targetWorkId).toBe("work-ebook");
    expect(link.suggestedWorkId).toBe("work-audio");
    expect(link.matchType).toBe("TITLE_ONLY");
    expect(link.confidence).toBe(1.0);
  });

  it("does not auto-merge title-only when titleCanonicals differ even if similar", async () => {
    const state = createEmptyState();
    // Audiobook stub with no authors and similar-but-not-identical title (similarity ~0.94)
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatspy", "The Great Gatspy");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    // No authors on audiobook
    // Ebook with similar but not identical title
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(0);
  });

  it("matches audiobook with trailing parenthetical narrator via normalized title", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/dispossessed.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the dispossessed leslie", "The Dispossessed (Leslie)");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Ursula K Le Guin");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/dispossessed.epub");
    addAudioWork(state, "work-ebook", "the dispossessed", "The Dispossessed");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Ursula K Le Guin");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("NORMALIZED_TITLE");
    // Works are NOT merged
    expect(state.works.has("work-audio")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);
  });

  it("matches audiobook with 'A Novel' suffix via normalized title", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/unsheltered.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "unsheltered a novel", "Unsheltered: A Novel");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Barbara Kingsolver");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/unsheltered.epub");
    addAudioWork(state, "work-ebook", "unsheltered", "Unsheltered");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Barbara Kingsolver");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("NORMALIZED_TITLE");
  });

  it("matches audiobook with subtitle via subtitle stripping", async () => {
    const state = createEmptyState();
    // Use different directories and filenames to avoid filename/folder boosts
    addAudioFileAsset(state, "file-audio", "/tmp/library-a/audio/shew-audiobook.m4b", MediaKind.AUDIO);
    addAudioWork(
      state,
      "work-audio",
      "against technoableism rethinking who needs improvement",
      "Against Technoableism: Rethinking Who Needs Improvement",
    );
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Ashley Shew");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/library-b/ebook/shew-book.epub");
    addAudioWork(state, "work-ebook", "against technoableism", "Against Technoableism");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Ashley Shew");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("SUBTITLE_STRIPPED");
    // Subtitle stripping applies 0.9 confidence penalty
    expect(link.confidence).toBeLessThan(1.0);
  });

  it("does not false-match different titles via normalization", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/creativity.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "creativity", "Creativity");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Some Author");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/chaos.epub");
    addAudioWork(state, "work-ebook", "from chaos to creativity", "From Chaos to Creativity");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Some Author");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(0);
  });

  it("creates separate links for multi-part audiobooks to the same ebook", async () => {
    const state = createEmptyState();
    // Ebook
    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/fourthwing.epub");
    addAudioWork(state, "work-ebook", "fourth wing", "Fourth Wing");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Rebecca Yarros");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");
    // Audiobook Part 1
    addAudioFileAsset(state, "file-audio1", "/tmp/root/audiobooks/fourthwing1.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio1", "fourth wing part 1 of 2 the empyrean book 1", "Fourth Wing (Part 1 of 2) - The Empyrean, Book 1");
    addAudioEdition(state, "edition-audio1", "work-audio1", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio1", "edition-audio1", "file-audio1");
    addAudioContributor(state, "c-audio1", "Rebecca Yarros");
    addAudioEditionContributor(state, "ec-audio1", "edition-audio1", "c-audio1");

    const services = createIngestServices({ db: createTestDb(state) });
    const result1 = await services.matchSuggestions({ fileAssetId: "file-audio1" });

    expect(result1.linksCreated).toBe(1);
    // Works are NOT merged
    expect(state.works.has("work-audio1")).toBe(true);
    expect(state.works.has("work-ebook")).toBe(true);

    // Audiobook Part 2 — separate work, creates another link
    addAudioFileAsset(state, "file-audio2", "/tmp/root/audiobooks/fourthwing2.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio2", "fourth wing part 2 of 2 the empyrean book 1", "Fourth Wing (Part 2 of 2) - The Empyrean, Book 1");
    addAudioEdition(state, "edition-audio2", "work-audio2", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio2", "edition-audio2", "file-audio2");
    addAudioContributor(state, "c-audio2", "Rebecca Yarros");
    addAudioEditionContributor(state, "ec-audio2", "edition-audio2", "c-audio2");

    const result2 = await services.matchSuggestions({ fileAssetId: "file-audio2" });

    expect(result2.linksCreated).toBe(1);
    expect(state.works.has("work-audio2")).toBe(true);
  });

  it("uses subtitle stripping for title-only (no-author) matches with exact equality", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/sapiens.m4b", MediaKind.AUDIO);
    addAudioWork(
      state,
      "work-audio",
      "sapiens a brief history of humankind",
      "Sapiens: A Brief History of Humankind",
    );
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    // No authors on audiobook

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/sapiens.epub");
    addAudioWork(state, "work-ebook", "sapiens", "Sapiens");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Yuval Noah Harari");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("TITLE_ONLY");
    expect(link.confidence).toBe(0.9); // SUBTITLE_CONFIDENCE_PENALTY
  });

  it("uses subtitle stripping for title-only when both sides have subtitles", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/heavy.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "heavy an american memoir", "Heavy: An American Memoir");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    // No authors on audiobook

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/heavy.epub");
    addAudioWork(state, "work-ebook", "heavy a personal history", "Heavy: A Personal History");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    // No authors on ebook

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // Both sides have subtitles (after ":"), stripped to "heavy" === "heavy"
    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("TITLE_ONLY");
    expect(link.confidence).toBe(0.9);
  });

  it("does not match title-only when both subtitles are stripped but bases differ", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/book.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "alpha a brief history", "Alpha: A Brief History");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/book.epub");
    addAudioWork(state, "work-ebook", "beta a brief history", "Beta: A Brief History");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // Both stripped to base before ":", but "alpha" !== "beta"
    expect(result.linksCreated).toBe(0);
  });

  it("does not match title-only via mixed subtitle stripping when bases differ", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/book.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "alpha a guide to life", "Alpha - A Guide to Life");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/book.epub");
    addAudioWork(state, "work-ebook", "beta", "Beta");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // Stripped "alpha" vs canonical "beta" — don't match
    expect(result.linksCreated).toBe(0);
  });

  it("matches title-only (no-author) when normalized titles are exactly equal", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/dispossessed.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the dispossessed leslie", "The Dispossessed (Leslie)");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    // No authors on audiobook

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/dispossessed.epub");
    addAudioWork(state, "work-ebook", "the dispossessed", "The Dispossessed");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Ursula K Le Guin");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("TITLE_ONLY");
  });

  it("matches via subtitle stripping when both sides have different subtitles", async () => {
    const state = createEmptyState();
    // Different directories and filenames to avoid boosts
    addAudioFileAsset(state, "file-audio", "/tmp/library-a/audio/polysecure-audio.m4b", MediaKind.AUDIO);
    addAudioWork(
      state,
      "work-audio",
      "polysecure attachment trauma and consensual nonmonogamy",
      "Polysecure - Attachment, Trauma and Consensual Nonmonogamy",
    );
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Jessica Fern");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/library-b/ebook/polysecure-ebook.epub");
    addAudioWork(
      state,
      "work-ebook",
      "polysecure healing your attachment style",
      "Polysecure: Healing Your Attachment Style",
    );
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Jessica Fern");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    expect(link.matchType).toBe("SUBTITLE_STRIPPED");
    expect(link.confidence).toBeLessThan(1.0);
  });

  it("falls through subtitle stripping when both sides have subtitles but stripped titles differ", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/library-a/audio/book-a.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "alpha subtitle one", "Alpha: Subtitle One");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Author X");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/library-b/ebook/book-b.epub");
    addAudioWork(state, "work-ebook", "omega subtitle two", "Omega: Subtitle Two");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Author X");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
  });

  it("falls through mixed subtitle stripping when only one side has subtitle but titles differ", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/library-a/audio/book-a.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "alpha", "Alpha");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Author X");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/library-b/ebook/book-b.epub");
    addAudioWork(state, "work-ebook", "omega a longer different title", "Omega: A Longer Different Title");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Author X");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(0);
  });

  it("skips pass 2 when normalized title returns undefined and falls through to pass 3", async () => {
    const state = createEmptyState();
    addAudioFileAsset(state, "file-audio", "/tmp/library-a/audio/book-a.m4b", MediaKind.AUDIO);
    // titleCanonical differs from ebook (pass 1 fails), display title normalizes to undefined
    addAudioWork(state, "work-audio", "x y z", "(...)");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "Author X");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/library-b/ebook/book-b.epub");
    addAudioWork(state, "work-ebook", "a b c", "Something Else");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "Author X");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    // No match — normalization returns undefined for one side, pass 3 also fails
    expect(result.linksCreated).toBe(0);
  });

  it("prefers pass 1 (canonical) over pass 2 (normalized) when both would match", async () => {
    const state = createEmptyState();
    // Both titles are identical — pass 1 should match, no normalization needed
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/gatsby.m4b", MediaKind.AUDIO);
    addAudioWork(state, "work-audio", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-audio", "work-audio", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");
    addAudioContributor(state, "c-audio", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-audio", "edition-audio", "c-audio");

    addAudioFileAsset(state, "file-ebook", "/tmp/root/ebooks/gatsby.epub");
    addAudioWork(state, "work-ebook", "the great gatsby", "The Great Gatsby");
    addAudioEdition(state, "edition-ebook", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook", "edition-ebook", "file-ebook");
    addAudioContributor(state, "c-ebook", "F Scott Fitzgerald");
    addAudioEditionContributor(state, "ec-ebook", "edition-ebook", "c-ebook");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.linksCreated).toBe(1);
    const link = getFirstMatchSuggestion(state);
    // Pass 1 matches — SAME_WORK, not NORMALIZED_TITLE
    expect(link.matchType).toBe("SAME_WORK");
  });

  it("does not create MatchSuggestion when audiobook and ebook editions are on the same work", async () => {
    const state = createEmptyState();
    // One work with TWO ebook editions
    addAudioFileAsset(state, "file-ebook-1", "/tmp/root/ebooks/circus1.epub");
    addAudioFileAsset(state, "file-ebook-2", "/tmp/root/ebooks/circus2.epub");
    addAudioWork(state, "work-ebook", "the night circus", "The Night Circus");
    addAudioEdition(state, "edition-ebook-1", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEdition(state, "edition-ebook-2", "work-ebook", { formatFamily: FormatFamily.EBOOK });
    addAudioEditionFile(state, "ef-ebook-1", "edition-ebook-1", "file-ebook-1");
    addAudioEditionFile(state, "ef-ebook-2", "edition-ebook-2", "file-ebook-2");
    addAudioContributor(state, "c-1", "Erin Morgenstern");
    addAudioEditionContributor(state, "ec-ebook-1", "edition-ebook-1", "c-1");
    // Second edition has no author — simulates the real scenario

    // One audiobook edition on the same work — already colocated
    addAudioFileAsset(state, "file-audio", "/tmp/root/audiobooks/circus.m4b", MediaKind.AUDIO);
    addAudioEdition(state, "edition-audio", "work-ebook", { formatFamily: FormatFamily.AUDIOBOOK });
    addAudioEditionFile(state, "ef-audio", "edition-audio", "file-audio");

    const services = createIngestServices({ db: createTestDb(state) });
    const result = await services.matchSuggestions({ fileAssetId: "file-audio" });

    expect(result.skipped).toBe(false);
    // Same-work editions don't need an MatchSuggestion
    expect(result.linksCreated).toBe(0);
    expect(state.matchSuggestions.size).toBe(0);
  });
});

describe("mergeWorksById", () => {
  it("moves editions from losing work to surviving work and deletes losing work", async () => {
    const state = createEmptyState();
    addWork(state, { id: "work-surviving", titleCanonical: "the great gatsby", titleDisplay: "The Great Gatsby" });
    addWork(state, { id: "work-losing", titleCanonical: "the great gatsby", titleDisplay: "The Great Gatsby" });
    addEdition(state, { id: "edition-surviving", workId: "work-surviving", formatFamily: FormatFamily.EBOOK });
    addEdition(state, { id: "edition-losing", workId: "work-losing", formatFamily: FormatFamily.AUDIOBOOK });

    const services = createIngestServices({ db: createTestDb(state) });
    await services.mergeWorksById("work-surviving", "work-losing");

    // Edition moved to surviving work
    expect(state.editions.get("edition-losing")?.workId).toBe("work-surviving");
    // Losing work deleted
    expect(state.works.has("work-losing")).toBe(false);
    // Surviving work still exists
    expect(state.works.has("work-surviving")).toBe(true);
  });

  it("reconciles metadata — fills null fields on surviving work from losing work", async () => {
    const state = createEmptyState();
    addWork(state, {
      id: "work-surviving",
      titleCanonical: "the great gatsby",
      titleDisplay: "The Great Gatsby",
    });
    const losingWork = addWork(state, {
      id: "work-losing",
      titleCanonical: "the great gatsby",
      titleDisplay: "The Great Gatsby",
    });
    losingWork.description = "A novel about the American Dream";
    losingWork.coverPath = "/covers/losing.jpg";

    const services = createIngestServices({ db: createTestDb(state) });
    await services.mergeWorksById("work-surviving", "work-losing");

    const surviving = state.works.get("work-surviving");
    expect(surviving?.description).toBe("A novel about the American Dream");
    expect(surviving?.coverPath).toBe("/covers/losing.jpg");
  });

  it("does not overwrite existing metadata on surviving work", async () => {
    const state = createEmptyState();
    const survivingWork = addWork(state, {
      id: "work-surviving",
      titleCanonical: "the great gatsby",
      titleDisplay: "The Great Gatsby",
    });
    survivingWork.description = "Surviving description";
    survivingWork.coverPath = "/covers/surviving.jpg";
    const losingWork = addWork(state, {
      id: "work-losing",
      titleCanonical: "the great gatsby",
      titleDisplay: "The Great Gatsby",
    });
    losingWork.description = "Losing description";
    losingWork.coverPath = "/covers/losing.jpg";

    const services = createIngestServices({ db: createTestDb(state) });
    await services.mergeWorksById("work-surviving", "work-losing");

    const surviving = state.works.get("work-surviving");
    expect(surviving?.description).toBe("Surviving description");
    expect(surviving?.coverPath).toBe("/covers/surviving.jpg");
  });

  it("moves multiple editions from losing work", async () => {
    const state = createEmptyState();
    addWork(state, { id: "work-surviving", titleCanonical: "the great gatsby", titleDisplay: "The Great Gatsby" });
    addWork(state, { id: "work-losing", titleCanonical: "the great gatsby", titleDisplay: "The Great Gatsby" });
    addEdition(state, { id: "edition-1", workId: "work-losing", formatFamily: FormatFamily.AUDIOBOOK });
    addEdition(state, { id: "edition-2", workId: "work-losing", formatFamily: FormatFamily.AUDIOBOOK });
    addEdition(state, { id: "edition-3", workId: "work-surviving", formatFamily: FormatFamily.EBOOK });

    const services = createIngestServices({ db: createTestDb(state) });
    await services.mergeWorksById("work-surviving", "work-losing");

    expect(state.editions.get("edition-1")?.workId).toBe("work-surviving");
    expect(state.editions.get("edition-2")?.workId).toBe("work-surviving");
    expect(state.editions.get("edition-3")?.workId).toBe("work-surviving");
    expect(state.works.has("work-losing")).toBe(false);
  });

  it("throws when surviving work does not exist", async () => {
    const state = createEmptyState();
    addWork(state, { id: "work-losing", titleCanonical: "the great gatsby", titleDisplay: "The Great Gatsby" });

    const services = createIngestServices({ db: createTestDb(state) });

    await expect(services.mergeWorksById("nonexistent", "work-losing")).rejects.toThrow(
      "Cannot merge: work not found (surviving=nonexistent, losing=work-losing)",
    );
  });

  it("throws when losing work does not exist", async () => {
    const state = createEmptyState();
    addWork(state, { id: "work-surviving", titleCanonical: "the great gatsby", titleDisplay: "The Great Gatsby" });

    const services = createIngestServices({ db: createTestDb(state) });

    await expect(services.mergeWorksById("work-surviving", "nonexistent")).rejects.toThrow(
      "Cannot merge: work not found (surviving=work-surviving, losing=nonexistent)",
    );
  });
});
