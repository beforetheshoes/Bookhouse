import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvailabilityStatus, type FileAsset, MediaKind } from "@bookhouse/domain";
import { LIBRARY_JOB_NAMES } from "@bookhouse/shared";
import {
  createIngestServices,
  isFileChanged,
  type IngestDb,
  walkRegularFiles,
} from "./index";

type ReaddirFn = typeof import("node:fs/promises").readdir;
type LstatFn = typeof import("node:fs/promises").lstat;

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

interface TestState {
  fileAssets: Map<string, TestFileAsset>;
  fileAssetsById: Map<string, TestFileAsset>;
  lastScannedAt: Date | null;
  rootPath: string;
}

function createTestDb(state: TestState): IngestDb {
  let sequence = 0;

  return {
    libraryRoot: {
      async findUnique({ where }) {
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
      async findMany({ where }) {
        return [...state.fileAssets.values()].filter(
          (fileAsset) => fileAsset.libraryRootId === where.libraryRootId,
        );
      },
      async findUnique({ where }) {
        return state.fileAssetsById.get(where.id) ?? null;
      },
      async update({ data, where }) {
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
        const existing = state.fileAssets.get(where.absolutePath);

        if (existing === undefined) {
          sequence += 1;
          const created: TestFileAsset = {
            ...create,
            fullHash: null,
            id: `file-${sequence}`,
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
  };
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
        return readdir(dirPath, options as Parameters<ReaddirFn>[1]);
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
      (async () => {
        throw new Error("permission denied");
      }) as ReaddirFn,
      (async () => {
        throw new Error("should not be called");
      }) as LstatFn,
    );

    expect(files).toEqual([]);
  });

  it("falls back to lstat for ambiguous directory entries", async () => {
    const files = await walkRegularFiles(
      "/tmp/fallback-root",
      (async (dirPath) => {
        if (String(dirPath) === path.resolve("/tmp/fallback-root")) {
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

        if (String(dirPath) === path.resolve("/tmp/fallback-root/nested")) {
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
        const normalized = path.resolve(String(entryPath));

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

    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: directory,
    };
    const enqueuedJobs: Array<{ jobName: string; payload: { fileAssetId: string } }> = [];
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: async (jobName, payload) => {
        enqueuedJobs.push({
          jobName,
          payload: payload as { fileAssetId: string },
        });
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
    expect(enqueuedJobs).toEqual([
      {
        jobName: LIBRARY_JOB_NAMES.HASH_FILE_ASSET,
        payload: { fileAssetId: "file-1" },
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

    state.fileAssets.get(path.join(directory, "author", "book.epub"))!.partialHash = "partial";
    state.fileAssets.get(path.join(directory, "author", "book.epub"))!.fullHash = "full";
    state.fileAssets.get(path.join(directory, "author", "cover.jpg"))!.partialHash = "partial";
    state.fileAssets.get(path.join(directory, "author", "cover.jpg"))!.fullHash = "full";

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
    const listDirectory = vi.fn(async () => [
      {
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        name: "gone.epub",
      },
    ]);
    const readStats = vi.fn(async () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });
    const services = createIngestServices({
      db: createTestDb({
        fileAssets: new Map(),
        fileAssetsById: new Map(),
        lastScannedAt: null,
        rootPath: "/tmp/root",
      }),
      enqueueLibraryJob: vi.fn(async () => undefined),
      listDirectory: listDirectory as never,
      readStats: readStats as never,
    });

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.discoveredPaths).toEqual([path.resolve("/tmp/root/gone.epub")]);
    expect(result.scannedFileAssetIds).toEqual([]);
  });

  it("throws when the library root does not exist", async () => {
    const services = createIngestServices({
      db: createTestDb({
        fileAssets: new Map(),
        fileAssetsById: new Map(),
        lastScannedAt: null,
        rootPath: "/tmp/root",
      }),
    });

    await expect(
      services.scanLibraryRoot({ libraryRootId: "missing-root" }),
    ).rejects.toThrow('Library root "missing-root" was not found');
  });

  it("creates services with default runtime dependencies", () => {
    const services = createIngestServices();

    expect(services).toMatchObject({
      hashFileAsset: expect.any(Function),
      parseFileAssetMetadata: expect.any(Function),
      scanLibraryRoot: expect.any(Function),
    });
  });

  it("skips paths that are no longer regular files during the scan upsert pass", async () => {
    const services = createIngestServices({
      db: createTestDb({
        fileAssets: new Map(),
        fileAssetsById: new Map(),
        lastScannedAt: null,
        rootPath: "/tmp/root",
      }),
      enqueueLibraryJob: vi.fn(async () => undefined),
      listDirectory: (async () =>
        [
          {
            isDirectory: () => false,
            isFile: () => true,
            isSymbolicLink: () => false,
            name: "ghost.epub",
          },
        ] as never) as ReaddirFn,
      readStats: (async () =>
        ({
          isFile: () => false,
          isSymbolicLink: () => true,
        }) as never) as LstatFn,
    });

    const result = await services.scanLibraryRoot({ libraryRootId: "root-1" });

    expect(result.scannedFileAssetIds).toEqual([]);
    expect(result.enqueuedHashJobs).toEqual([]);
  });

  it("hashes file assets and marks missing files without clearing prior hashes", async () => {
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      hashFile: vi.fn(async () => ({
        fullHash: "next-full",
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: "next-partial",
        sizeBytes: 12n,
      })),
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      hashFile: vi.fn(async () => {
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
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob: vi.fn(async () => undefined),
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      hashFile: vi.fn(async () => {
        throw hashError;
      }),
    });

    await expect(
      failingServices.hashFileAsset({ fileAssetId: "file-1" }),
    ).rejects.toBe(hashError);
  });

  it("enqueues metadata parsing after hashing EPUB assets", async () => {
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
    const enqueueLibraryJob = vi.fn(async () => undefined);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => ({
        fullHash: "next-full",
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: "next-partial",
        sizeBytes: 12n,
      })),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("does not enqueue metadata parsing after hashing non-EPUB assets", async () => {
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
    const enqueueLibraryJob = vi.fn(async () => undefined);
    const services = createIngestServices({
      db: createTestDb(state),
      enqueueLibraryJob,
      hashFile: vi.fn(async () => ({
        fullHash: "next-full",
        mtime: new Date("2025-01-01T00:00:00.000Z"),
        partialHash: "next-partial",
        sizeBytes: 12n,
      })),
    });

    await services.hashFileAsset({ fileAssetId: "file-1" });

    expect(enqueueLibraryJob).not.toHaveBeenCalledWith(
      LIBRARY_JOB_NAMES.PARSE_FILE_ASSET_METADATA,
      { fileAssetId: "file-1" },
    );
  });

  it("parses EPUB metadata and persists normalized results", async () => {
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      parseEpub: vi.fn(async () => ({
        authors: ["  N. K. Jemisin  ", "N. K. Jemisin"],
        identifiers: [
          { scheme: "ISBN-13", value: "978-0-316-49883-4" },
          { value: "B012345678" },
        ],
        title: "  The Fifth Season ",
      })),
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
  });

  it("skips metadata parsing for non-EPUB assets", async () => {
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
      enqueueLibraryJob: vi.fn(async () => undefined),
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
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      parseEpub: vi.fn(async () => {
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
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      parseEpub: vi.fn(async () => {
        throw "bad-value";
      }),
    });

    await services.parseFileAssetMetadata({ fileAssetId: "file-1" });

    expect(state.fileAssetsById.get("file-1")?.metadata).toMatchObject({
      warnings: ["Unknown EPUB parsing error"],
    });
  });

  it("marks missing EPUBs during metadata parsing when the file disappears", async () => {
    const state: TestState = {
      fileAssets: new Map(),
      fileAssetsById: new Map(),
      lastScannedAt: null,
      rootPath: "/tmp/root",
    };
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
      enqueueLibraryJob: vi.fn(async () => undefined),
      parseEpub: vi.fn(async () => {
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

  it("throws when metadata parsing is requested for an unknown file asset", async () => {
    const services = createIngestServices({
      db: createTestDb({
        fileAssets: new Map(),
        fileAssetsById: new Map(),
        lastScannedAt: null,
        rootPath: "/tmp/root",
      }),
      enqueueLibraryJob: vi.fn(async () => undefined),
    });

    await expect(
      services.parseFileAssetMetadata({ fileAssetId: "missing-file" }),
    ).rejects.toThrow('File asset "missing-file" was not found');
  });
});
