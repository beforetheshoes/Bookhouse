import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGzip } from "node:zlib";
import { pack as tarPack } from "tar-stream";
import { type RestoreBackupDeps, restoreBackup } from "./restore-backup";
import type { BackupManifest } from "./manifest";

function createArchive(entries: { name: string; data: string | Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = tarPack();
    const gzip = createGzip();
    const chunks: Buffer[] = [];

    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => { resolve(Buffer.concat(chunks)); });
    gzip.on("error", reject);

    for (const entry of entries) {
      p.entry({ name: entry.name }, entry.data);
    }
    p.finalize();
    p.pipe(gzip);
  });
}

const VALID_MANIFEST: BackupManifest = {
  version: 1,
  timestamp: "2026-03-28T12:00:00.000Z",
  databaseSize: 10,
  coverCount: 1,
  coverSize: 3,
};

function createMockDeps(overrides: Partial<RestoreBackupDeps> = {}): RestoreBackupDeps {
  return {
    execFile: vi.fn().mockResolvedValue({ stdout: "" }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    mkdtemp: vi.fn().mockResolvedValue("/tmp/bookhouse-restore-abc"),
    coverCacheDir: "/data/covers",
    databaseUrl: "postgresql://user:pass@localhost:5432/bookhouse",
    psqlBin: "psql",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("restoreBackup", () => {
  it("validates and parses manifest from archive", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "CREATE TABLE;" },
      { name: "covers/work-1/thumb.webp", data: "img" },
    ]);
    const deps = createMockDeps();

    const result = await restoreBackup(deps, archive);

    expect(result.manifest).toEqual(VALID_MANIFEST);
  });

  it("rejects archive with missing manifest", async () => {
    const archive = await createArchive([
      { name: "database.sql", data: "SQL" },
    ]);
    const deps = createMockDeps();

    await expect(restoreBackup(deps, archive)).rejects.toThrow("manifest");
  });

  it("rejects archive with invalid manifest", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify({ version: 99 }) },
      { name: "database.sql", data: "SQL" },
    ]);
    const deps = createMockDeps();

    await expect(restoreBackup(deps, archive)).rejects.toThrow();
  });

  it("rejects archive with missing database.sql", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
    ]);
    const deps = createMockDeps();

    await expect(restoreBackup(deps, archive)).rejects.toThrow("database.sql");
  });

  it("rejects entries with path traversal (..)", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
      { name: "covers/../../../etc/passwd", data: "bad" },
    ]);
    const deps = createMockDeps();

    await expect(restoreBackup(deps, archive)).rejects.toThrow("path traversal");
  });

  it("rejects entries with absolute paths", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
      { name: "/etc/passwd", data: "bad" },
    ]);
    const deps = createMockDeps();

    await expect(restoreBackup(deps, archive)).rejects.toThrow("path traversal");
  });

  it("calls psql with correct args and PGPASSWORD env var", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "CREATE TABLE test;" },
    ]);
    const deps = createMockDeps();

    await restoreBackup(deps, archive);

    expect(deps.execFile).toHaveBeenCalledWith(
      "psql",
      expect.arrayContaining([
        "--host=localhost",
        "--port=5432",
        "--username=user",
        "--dbname=bookhouse",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: "pass" }) as object,
      }) as object,
    );
  });

  it("writes database.sql to temp file for psql", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "CREATE TABLE test;" },
    ]);
    const deps = createMockDeps();

    await restoreBackup(deps, archive);

    expect(deps.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("database.sql"),
      expect.any(Buffer),
    );
  });

  it("writes cover files to temp directory", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
      { name: "covers/work-1/thumb.webp", data: "img" },
    ]);
    const deps = createMockDeps();

    await restoreBackup(deps, archive);

    expect(deps.mkdir).toHaveBeenCalledWith(
      expect.stringContaining("work-1"),
      expect.objectContaining({ recursive: true }),
    );
    expect(deps.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("work-1/thumb.webp"),
      expect.any(Buffer),
    );
  });

  it("swaps cover directories atomically", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
    ]);
    const deps = createMockDeps();

    await restoreBackup(deps, archive);

    // Old covers renamed to backup path
    expect(deps.rename).toHaveBeenCalledWith(
      "/data/covers",
      expect.stringContaining("covers-old"),
    );
    // Temp covers moved to real path
    expect(deps.rename).toHaveBeenCalledWith(
      expect.stringContaining("bookhouse-restore"),
      "/data/covers",
    );
    // Old covers cleaned up
    expect(deps.rm).toHaveBeenCalledWith(
      expect.stringContaining("covers-old"),
      expect.objectContaining({ recursive: true, force: true }),
    );
  });

  it("swaps cover directories when coverCacheDir does not exist yet", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
    ]);
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const deps = createMockDeps({
      rename: vi.fn()
        .mockRejectedValueOnce(enoent) // first rename (old covers) fails with ENOENT
        .mockResolvedValue(undefined),  // second rename (temp → real) succeeds
    });

    await restoreBackup(deps, archive);

    expect(deps.rename).toHaveBeenCalledWith(
      expect.stringContaining("bookhouse-restore"),
      "/data/covers",
    );
  });

  it("rethrows non-ENOENT errors during cover directory swap", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
    ]);
    const deps = createMockDeps({
      rename: vi.fn().mockRejectedValueOnce(new Error("EPERM")),
    });

    await expect(restoreBackup(deps, archive)).rejects.toThrow("EPERM");
  });

  it("cleans up temp database file", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
    ]);
    const deps = createMockDeps();

    await restoreBackup(deps, archive);

    expect(deps.rm).toHaveBeenCalledWith(
      expect.stringContaining("database.sql"),
      expect.objectContaining({ force: true }),
    );
  });

  it("ignores unknown entries in archive", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
      { name: "unknown-file.txt", data: "ignored" },
    ]);
    const deps = createMockDeps();

    const result = await restoreBackup(deps, archive);

    expect(result.manifest).toEqual(VALID_MANIFEST);
  });

  it("propagates psql errors", async () => {
    const archive = await createArchive([
      { name: "manifest.json", data: JSON.stringify(VALID_MANIFEST) },
      { name: "database.sql", data: "SQL" },
    ]);
    const deps = createMockDeps({
      execFile: vi.fn().mockRejectedValue(new Error("psql: connection refused")),
    });

    await expect(restoreBackup(deps, archive)).rejects.toThrow("psql: connection refused");
  });
});
