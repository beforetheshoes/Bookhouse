import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Dirent } from "node:fs";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extract as tarExtract, type Headers } from "tar-stream";
import { type CreateBackupDeps, createBackup } from "./create-backup";
import { backupManifestSchema } from "./manifest";

function makeDirent(name: string, isFile: boolean): Dirent {
  return {
    name,
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "/data/covers",
    path: "/data/covers",
  } as Dirent;
}

function collectEntries(stream: Readable): Promise<{ header: Headers; body: Buffer }[]> {
  return new Promise((resolve, reject) => {
    const entries: { header: Headers; body: Buffer }[] = [];
    const gunzip = createGunzip();
    const extractor = tarExtract();

    extractor.on("entry", (header, entryStream, next) => {
      const chunks: Buffer[] = [];
      entryStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      entryStream.on("end", () => {
        entries.push({ header, body: Buffer.concat(chunks) });
        next();
      });
    });

    extractor.on("finish", () => { resolve(entries); });
    extractor.on("error", (err: Error) => { reject(err); });
    gunzip.on("error", (err: Error) => { reject(err); });

    stream.pipe(gunzip).pipe(extractor);
  });
}

function createMockDeps(overrides: Partial<CreateBackupDeps> = {}): CreateBackupDeps {
  return {
    execFile: vi.fn().mockResolvedValue({ stdout: Buffer.from("-- pg_dump output\nCREATE TABLE test;") }),
    readdir: vi.fn().mockResolvedValue([
      makeDirent("work-1", false),
      makeDirent("work-2", false),
    ]),
    readFile: vi.fn().mockResolvedValue(Buffer.from("fake-image-data")),
    stat: vi.fn().mockResolvedValue({ size: 15 }),
    coverCacheDir: "/data/covers",
    databaseUrl: "postgresql://user:pass@localhost:5432/bookhouse",
    pgDumpBin: "pg_dump",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("createBackup", () => {
  it("calls pg_dump with correct args and PGPASSWORD env var", async () => {
    const deps = createMockDeps({
      readdir: vi.fn()
        .mockResolvedValueOnce([]) // top-level: no cover dirs
        .mockResolvedValueOnce([]), // shouldn't be called
    });

    await createBackup(deps);

    expect(deps.execFile).toHaveBeenCalledWith(
      "pg_dump",
      expect.arrayContaining(["--clean", "--if-exists", "--no-owner"]),
      expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: "pass" }) as object,
        maxBuffer: expect.any(Number) as number,
        encoding: "buffer",
      }) as object,
    );
  });

  it("passes host, port, user, and database to pg_dump", async () => {
    const deps = createMockDeps({
      readdir: vi.fn().mockResolvedValue([]),
    });

    await createBackup(deps);

    const execFileMock = deps.execFile as ReturnType<typeof vi.fn>;
    const callArgs = execFileMock.mock.calls[0] as [string, string[], object];
    const args = callArgs[1];
    expect(args).toContain("--host=localhost");
    expect(args).toContain("--port=5432");
    expect(args).toContain("--username=user");
    expect(args).toContain("bookhouse");
  });

  it("does not include password in pg_dump CLI args", async () => {
    const deps = createMockDeps({
      readdir: vi.fn().mockResolvedValue([]),
    });

    await createBackup(deps);

    const execFileMock2 = deps.execFile as ReturnType<typeof vi.fn>;
    const callArgs2 = execFileMock2.mock.calls[0] as [string, string[], object];
    const args = callArgs2[1];
    expect(args.join(" ")).not.toContain("pass");
  });

  it("produces a valid tar.gz archive with manifest.json and database.sql", async () => {
    const deps = createMockDeps({
      readdir: vi.fn().mockResolvedValue([]),
    });

    const { stream } = await createBackup(deps);
    const entries = await collectEntries(stream);
    const names = entries.map((e) => e.header.name);

    expect(names).toContain("manifest.json");
    expect(names).toContain("database.sql");
  });

  it("includes valid manifest with correct schema", async () => {
    const deps = createMockDeps({
      readdir: vi.fn().mockResolvedValue([]),
    });

    const { stream, manifest } = await createBackup(deps);
    const entries = await collectEntries(stream);
    const manifestEntry = entries.find((e) => e.header.name === "manifest.json");
    if (!manifestEntry) throw new Error("manifest.json not found in archive");
    const parsed = JSON.parse(manifestEntry.body.toString()) as Record<string, number | string>;

    expect(() => backupManifestSchema.parse(parsed)).not.toThrow();
    expect(parsed).toEqual(manifest);
  });

  it("includes database dump content in database.sql entry", async () => {
    const deps = createMockDeps({
      readdir: vi.fn().mockResolvedValue([]),
    });

    const { stream } = await createBackup(deps);
    const entries = await collectEntries(stream);
    const dbEntry = entries.find((e) => e.header.name === "database.sql");
    expect(dbEntry).toBeDefined();
    expect(dbEntry?.body.toString()).toBe("-- pg_dump output\nCREATE TABLE test;");
  });

  it("walks cover directories and includes files in archive", async () => {
    const deps = createMockDeps({
      readdir: vi.fn()
        .mockResolvedValueOnce([makeDirent("work-1", false)]) // top-level dirs
        .mockResolvedValueOnce([makeDirent("thumb.webp", true), makeDirent("medium.webp", true)]), // work-1 files
      readFile: vi.fn().mockResolvedValue(Buffer.from("img")),
      stat: vi.fn().mockResolvedValue({ size: 3 }),
    });

    const { stream } = await createBackup(deps);
    const entries = await collectEntries(stream);
    const coverEntries = entries.filter((e) => e.header.name.startsWith("covers/"));

    expect(coverEntries).toHaveLength(2);
    expect(coverEntries.map((e) => e.header.name)).toEqual(
      expect.arrayContaining(["covers/work-1/thumb.webp", "covers/work-1/medium.webp"]),
    );
  });

  it("handles nested author directories", async () => {
    const deps = createMockDeps({
      readdir: vi.fn()
        .mockResolvedValueOnce([makeDirent("authors", false)]) // top-level
        .mockResolvedValueOnce([makeDirent("contrib-1", false)]) // authors/
        .mockResolvedValueOnce([makeDirent("thumb.webp", true)]), // authors/contrib-1/
      readFile: vi.fn().mockResolvedValue(Buffer.from("img")),
      stat: vi.fn().mockResolvedValue({ size: 3 }),
    });

    const { stream } = await createBackup(deps);
    const entries = await collectEntries(stream);
    const authorEntry = entries.find((e) => e.header.name === "covers/authors/contrib-1/thumb.webp");

    expect(authorEntry).toBeDefined();
    expect(authorEntry?.body.toString()).toBe("img");
  });

  it("sets manifest coverCount and coverSize correctly", async () => {
    const deps = createMockDeps({
      readdir: vi.fn()
        .mockResolvedValueOnce([makeDirent("work-1", false)])
        .mockResolvedValueOnce([makeDirent("thumb.webp", true), makeDirent("medium.webp", true)]),
      stat: vi.fn().mockResolvedValue({ size: 100 }),
    });

    const { manifest } = await createBackup(deps);

    expect(manifest.coverCount).toBe(2);
    expect(manifest.coverSize).toBe(200);
  });

  it("sets manifest databaseSize from dump buffer length", async () => {
    const dump = Buffer.from("SQL dump content");
    const deps = createMockDeps({
      execFile: vi.fn().mockResolvedValue({ stdout: dump }),
      readdir: vi.fn().mockResolvedValue([]),
    });

    const { manifest } = await createBackup(deps);

    expect(manifest.databaseSize).toBe(dump.length);
  });

  it("propagates pg_dump errors", async () => {
    const deps = createMockDeps({
      execFile: vi.fn().mockRejectedValue(new Error("pg_dump: connection refused")),
      readdir: vi.fn().mockResolvedValue([]),
    });

    await expect(createBackup(deps)).rejects.toThrow("pg_dump: connection refused");
  });
});
