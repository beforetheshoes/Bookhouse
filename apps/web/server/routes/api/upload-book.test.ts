import { describe, expect, it, vi } from "vitest";
import { MediaKind } from "@bookhouse/domain";
import {
  createUploadBookHandler,
  finalizeUpload,
  isAllowedUploadFilename,
  sanitizeUploadFilename,
  type UploadBookHandlerDeps,
  type UploadedFilePart,
} from "./upload-book";

interface HandlerOverrides {
  parseResult?: { fields: Record<string, string | undefined>; files: UploadedFilePart[] };
  parseError?: Error;
  libraryRoot?: { id: string; path: string } | null;
  requireOwner?: (event: unknown) => void;
  finalizeResult?: { absolutePaths: string[] };
  finalizeError?: Error;
  enqueueResult?: string | undefined;
  targetDirExists?: boolean;
}

function makeDeps(overrides: HandlerOverrides = {}): {
  deps: UploadBookHandlerDeps;
  cleanup: ReturnType<typeof vi.fn>;
  createImportJob: ReturnType<typeof vi.fn>;
  setImportJobBullmqId: ReturnType<typeof vi.fn>;
  enqueueIngestJob: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
  parseMultipart: ReturnType<typeof vi.fn>;
  targetDirExists: ReturnType<typeof vi.fn>;
  ensureStagingDir: ReturnType<typeof vi.fn>;
} {
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const createImportJob = vi.fn().mockResolvedValue({ id: "import-1" });
  const setImportJobBullmqId = vi.fn().mockResolvedValue(undefined);
  const enqueueIngestJob = vi.fn().mockResolvedValue(
    "enqueueResult" in overrides ? overrides.enqueueResult : "bull-1",
  );
  const finalize = vi.fn().mockImplementation(async () => {
    if (overrides.finalizeError) throw overrides.finalizeError;
    return overrides.finalizeResult ?? { absolutePaths: ["/data/ebooks/Author/Title/book.epub"] };
  });
  const parseMultipart = vi.fn().mockImplementation(async () => {
    if (overrides.parseError) throw overrides.parseError;
    return overrides.parseResult ?? {
      fields: {
        libraryRootId: "root-1",
        title: "Title",
        author: "Author",
      },
      files: [
        {
          basename: "book.epub",
          mediaKind: MediaKind.EPUB,
          stagingPath: "/tmp/staging/book.epub",
          sizeBytes: 2048,
        },
      ],
    };
  });
  const findLibraryRoot = vi.fn().mockResolvedValue(
    overrides.libraryRoot === undefined
      ? { id: "root-1", path: "/data/ebooks" }
      : overrides.libraryRoot,
  );
  const requireOwner = overrides.requireOwner ?? vi.fn();

  const targetDirExists = vi.fn().mockResolvedValue(overrides.targetDirExists ?? false);
  const ensureStagingDir = vi.fn().mockResolvedValue(undefined);

  return {
    deps: {
      requireOwner,
      db: {
        findLibraryRoot,
        createImportJob,
        setImportJobBullmqId,
      },
      enqueueIngestJob,
      parseMultipart,
      finalize,
      cleanup,
      targetDirExists,
      ensureStagingDir,
    },
    cleanup,
    createImportJob,
    setImportJobBullmqId,
    enqueueIngestJob,
    finalize,
    parseMultipart,
    targetDirExists,
    ensureStagingDir,
  };
}

describe("createUploadBookHandler", () => {
  it("returns importJobId and absolutePaths on the happy path", async () => {
    const { deps, finalize, enqueueIngestJob, setImportJobBullmqId, cleanup } = makeDeps();
    const handler = createUploadBookHandler(deps);

    const result = await handler({} as never);

    expect(result.importJobId).toBe("import-1");
    expect(result.libraryRootId).toBe("root-1");
    expect(result.folderRelativePath).toContain("Author");
    expect(result.absolutePaths).toEqual(["/data/ebooks/Author/Title/book.epub"]);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(enqueueIngestJob).toHaveBeenCalledWith({
      libraryRootId: "root-1",
      absolutePaths: ["/data/ebooks/Author/Title/book.epub"],
      importJobId: "import-1",
    });
    expect(setImportJobBullmqId).toHaveBeenCalledWith("import-1", "bull-1");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("calls requireOwner and surfaces a 403 if it throws", async () => {
    const requireOwner = vi.fn(() => {
      throw new Error("forbidden");
    });
    const { deps } = makeDeps({ requireOwner });
    const handler = createUploadBookHandler(deps);

    await expect(handler({} as never)).rejects.toThrow("forbidden");
  });

  it("rejects with 400 when libraryRootId is missing", async () => {
    const { deps } = makeDeps({
      parseResult: { fields: { title: "T", author: "A" }, files: [
        { basename: "b.epub", mediaKind: MediaKind.EPUB, stagingPath: "/tmp/b.epub", sizeBytes: 1 },
      ] },
    });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining("libraryRootId"),
    });
  });

  it("rejects with 400 when title is missing", async () => {
    const { deps } = makeDeps({
      parseResult: { fields: { libraryRootId: "root-1", author: "A" }, files: [
        { basename: "b.epub", mediaKind: MediaKind.EPUB, stagingPath: "/tmp/b.epub", sizeBytes: 1 },
      ] },
    });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining("title"),
    });
  });

  it("rejects with 400 when author is missing", async () => {
    const { deps } = makeDeps({
      parseResult: { fields: { libraryRootId: "root-1", title: "T" }, files: [
        { basename: "b.epub", mediaKind: MediaKind.EPUB, stagingPath: "/tmp/b.epub", sizeBytes: 1 },
      ] },
    });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining("author"),
    });
  });

  it("rejects with 400 when no files were uploaded", async () => {
    const { deps } = makeDeps({
      parseResult: { fields: { libraryRootId: "root-1", title: "T", author: "A" }, files: [] },
    });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining("at least one file"),
    });
  });

  it("rejects with 400 when no content files (only sidecar/cover) are uploaded", async () => {
    const { deps } = makeDeps({
      parseResult: {
        fields: { libraryRootId: "root-1", title: "T", author: "A" },
        files: [
          { basename: "metadata.opf", mediaKind: MediaKind.SIDECAR, stagingPath: "/tmp/m.opf", sizeBytes: 1 },
        ],
      },
    });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining("no book content"),
    });
  });

  it("rejects mixed ebook + audiobook uploads with 400", async () => {
    const { deps } = makeDeps({
      parseResult: {
        fields: { libraryRootId: "root-1", title: "T", author: "A" },
        files: [
          { basename: "b.epub", mediaKind: MediaKind.EPUB, stagingPath: "/tmp/b.epub", sizeBytes: 1 },
          { basename: "ch.mp3", mediaKind: MediaKind.AUDIO, stagingPath: "/tmp/ch.mp3", sizeBytes: 1 },
        ],
      },
    });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining("mix"),
    });
  });

  it("returns 409 when the target folder already exists", async () => {
    const { deps } = makeDeps({ targetDirExists: true });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("returns 404 when libraryRoot is not found", async () => {
    const { deps } = makeDeps({ libraryRoot: null });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("always invokes cleanup even when the handler errors after parse", async () => {
    const { deps, cleanup } = makeDeps({ libraryRoot: null });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toBeDefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("invokes cleanup even when parseMultipart throws", async () => {
    const { deps, cleanup } = makeDeps({ parseError: new Error("multipart fail") });
    await expect(createUploadBookHandler(deps)({} as never)).rejects.toThrow("multipart fail");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not call setImportJobBullmqId when enqueue returns undefined", async () => {
    const { deps, setImportJobBullmqId } = makeDeps({ enqueueResult: undefined });
    await createUploadBookHandler(deps)({} as never);
    expect(setImportJobBullmqId).not.toHaveBeenCalled();
  });

  it("forwards optional series/seriesIndex/description fields to finalize", async () => {
    const { deps, finalize } = makeDeps({
      parseResult: {
        fields: {
          libraryRootId: "root-1",
          title: "T",
          author: "A",
          series: "Saga",
          seriesIndex: "2",
          description: "About a book",
        },
        files: [
          { basename: "b.epub", mediaKind: MediaKind.EPUB, stagingPath: "/tmp/b.epub", sizeBytes: 1 },
        ],
      },
    });
    await createUploadBookHandler(deps)({} as never);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: {
          title: "T",
          author: "A",
          series: "Saga",
          seriesIndex: "2",
          description: "About a book",
        },
      }),
    );
  });

  it("passes mediaKind=AUDIOBOOK when only audio files are uploaded", async () => {
    const { deps, finalize } = makeDeps({
      parseResult: {
        fields: { libraryRootId: "root-1", title: "T", author: "A" },
        files: [
          { basename: "01.mp3", mediaKind: MediaKind.AUDIO, stagingPath: "/tmp/01.mp3", sizeBytes: 1 },
          { basename: "02.mp3", mediaKind: MediaKind.AUDIO, stagingPath: "/tmp/02.mp3", sizeBytes: 1 },
        ],
      },
      libraryRoot: { id: "root-1", path: "/data/audiobooks" },
    });
    await createUploadBookHandler(deps)({} as never);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ mediaKind: "AUDIOBOOK" }),
    );
  });
});

describe("isAllowedUploadFilename", () => {
  it("accepts ebook formats", () => {
    expect(isAllowedUploadFilename("book.epub")).toBe(true);
    expect(isAllowedUploadFilename("book.pdf")).toBe(true);
    expect(isAllowedUploadFilename("book.mobi")).toBe(true);
    expect(isAllowedUploadFilename("book.cbz")).toBe(true);
  });

  it("accepts audiobook formats", () => {
    expect(isAllowedUploadFilename("file.m4b")).toBe(true);
    expect(isAllowedUploadFilename("01-chapter.mp3")).toBe(true);
  });

  it("accepts cover images", () => {
    expect(isAllowedUploadFilename("cover.jpg")).toBe(true);
    expect(isAllowedUploadFilename("cover.png")).toBe(true);
    expect(isAllowedUploadFilename("cover.webp")).toBe(true);
  });

  it("accepts metadata sidecars but not arbitrary .json/.xml files", () => {
    expect(isAllowedUploadFilename("metadata.opf")).toBe(true);
    expect(isAllowedUploadFilename("metadata.json")).toBe(true);
    expect(isAllowedUploadFilename("notes.txt")).toBe(false);
    expect(isAllowedUploadFilename("something.json")).toBe(false);
  });

  it("rejects unknown / dangerous files", () => {
    expect(isAllowedUploadFilename("script.exe")).toBe(false);
    expect(isAllowedUploadFilename("page.html")).toBe(false);
    expect(isAllowedUploadFilename("README")).toBe(false);
  });
});

describe("sanitizeUploadFilename", () => {
  it("strips path components", () => {
    expect(sanitizeUploadFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeUploadFilename("foo/bar.epub")).toBe("bar.epub");
  });

  it("rejects empty / dot / dotfile names", () => {
    expect(sanitizeUploadFilename("")).toBe("");
    expect(sanitizeUploadFilename(".")).toBe("");
    expect(sanitizeUploadFilename("..")).toBe("");
    expect(sanitizeUploadFilename(".hidden")).toBe("");
  });

  it("replaces control + reserved chars with underscores", () => {
    expect(sanitizeUploadFilename("foo\x00bar.epub")).toBe("foo_bar.epub");
    expect(sanitizeUploadFilename("foo:bar?baz.epub")).toBe("foo_bar_baz.epub");
  });

  it("preserves valid filenames as-is", () => {
    expect(sanitizeUploadFilename("Mistborn - The Final Empire.epub")).toBe(
      "Mistborn - The Final Empire.epub",
    );
  });
});

describe("finalizeUpload", () => {
  it("writes a metadata.opf sidecar for ebook uploads when none was supplied", async () => {
    const targetDir = `${await import("node:os").then((m) => m.tmpdir())}/bookhouse-upload-test-${Math.random()}`;
    const fs = await import("node:fs/promises");
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/book.epub`, "epub-bytes");

    const result = await finalizeUpload({
      targetDir,
      files: [
        {
          basename: "book.epub",
          mediaKind: MediaKind.EPUB,
          stagingPath: `${stagingDir}/book.epub`,
          sizeBytes: 10,
        },
      ],
      fields: { title: "T", author: "A", description: "D", series: "S", seriesIndex: "2" },
      mediaKind: "EBOOK",
    });

    expect(result.absolutePaths).toContain(`${targetDir}/book.epub`);
    expect(result.absolutePaths).toContain(`${targetDir}/metadata.opf`);
    const opf = await fs.readFile(`${targetDir}/metadata.opf`, "utf8");
    expect(opf).toContain("<dc:title>T</dc:title>");
    expect(opf).toContain("calibre:series");

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("writes a metadata.json sidecar for audiobook uploads when none was supplied", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/01.mp3`, "audio-bytes");

    const result = await finalizeUpload({
      targetDir,
      files: [
        {
          basename: "01.mp3",
          mediaKind: MediaKind.AUDIO,
          stagingPath: `${stagingDir}/01.mp3`,
          sizeBytes: 10,
        },
      ],
      fields: { title: "T", author: "A" },
      mediaKind: "AUDIOBOOK",
    });

    expect(result.absolutePaths).toContain(`${targetDir}/01.mp3`);
    expect(result.absolutePaths).toContain(`${targetDir}/metadata.json`);
    const json = JSON.parse(await fs.readFile(`${targetDir}/metadata.json`, "utf8")) as { title: string };
    expect(json.title).toBe("T");

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("does not overwrite a user-supplied metadata.opf", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/book.epub`, "epub-bytes");
    await fs.writeFile(`${stagingDir}/metadata.opf`, "USER-PROVIDED-OPF");

    const result = await finalizeUpload({
      targetDir,
      files: [
        { basename: "book.epub", mediaKind: MediaKind.EPUB, stagingPath: `${stagingDir}/book.epub`, sizeBytes: 10 },
        { basename: "metadata.opf", mediaKind: MediaKind.SIDECAR, stagingPath: `${stagingDir}/metadata.opf`, sizeBytes: 10 },
      ],
      fields: { title: "T", author: "A" },
      mediaKind: "EBOOK",
    });

    const opf = await fs.readFile(`${targetDir}/metadata.opf`, "utf8");
    expect(opf).toBe("USER-PROVIDED-OPF");
    expect(result.absolutePaths).toEqual([
      `${targetDir}/book.epub`,
      `${targetDir}/metadata.opf`,
    ]);

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("does not overwrite a user-supplied metadata.json", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/01.mp3`, "audio-bytes");
    await fs.writeFile(`${stagingDir}/metadata.json`, '{"user":"provided"}');

    await finalizeUpload({
      targetDir,
      files: [
        { basename: "01.mp3", mediaKind: MediaKind.AUDIO, stagingPath: `${stagingDir}/01.mp3`, sizeBytes: 10 },
        { basename: "metadata.json", mediaKind: MediaKind.SIDECAR, stagingPath: `${stagingDir}/metadata.json`, sizeBytes: 10 },
      ],
      fields: { title: "T", author: "A" },
      mediaKind: "AUDIOBOOK",
    });

    const json = await fs.readFile(`${targetDir}/metadata.json`, "utf8");
    expect(json).toBe('{"user":"provided"}');

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("writes minimal sidecar when optional fields are omitted", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/book.epub`, "epub-bytes");

    await finalizeUpload({
      targetDir,
      files: [
        { basename: "book.epub", mediaKind: MediaKind.EPUB, stagingPath: `${stagingDir}/book.epub`, sizeBytes: 10 },
      ],
      fields: { title: "Title Only", author: "Solo Author" },
      mediaKind: "EBOOK",
    });

    const opf = await fs.readFile(`${targetDir}/metadata.opf`, "utf8");
    expect(opf).not.toContain("calibre:series");
    expect(opf).not.toContain("<dc:description>");

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("writes audiobook sidecar with series when supplied (no description)", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/file.m4b`, "audio-bytes");

    await finalizeUpload({
      targetDir,
      files: [
        { basename: "file.m4b", mediaKind: MediaKind.AUDIO, stagingPath: `${stagingDir}/file.m4b`, sizeBytes: 10 },
      ],
      fields: { title: "T", author: "A", series: "Foo", seriesIndex: "3" },
      mediaKind: "AUDIOBOOK",
    });

    const json = JSON.parse(await fs.readFile(`${targetDir}/metadata.json`, "utf8")) as {
      series: Array<{ name: string; sequence: string }>;
      description?: string;
    };
    expect(json.series).toEqual([{ name: "Foo", sequence: "3" }]);
    expect(json.description).toBeUndefined();

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("writes ebook sidecar with series but no index", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/b.epub`, "ebook-bytes");

    await finalizeUpload({
      targetDir,
      files: [
        { basename: "b.epub", mediaKind: MediaKind.EPUB, stagingPath: `${stagingDir}/b.epub`, sizeBytes: 10 },
      ],
      fields: { title: "T", author: "A", series: "Saga" },
      mediaKind: "EBOOK",
    });

    const opf = await fs.readFile(`${targetDir}/metadata.opf`, "utf8");
    expect(opf).toContain('content="Saga"');
    expect(opf).not.toContain("series_index");

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("writes audiobook sidecar with series but no index", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/file.m4b`, "audio-bytes");

    await finalizeUpload({
      targetDir,
      files: [
        { basename: "file.m4b", mediaKind: MediaKind.AUDIO, stagingPath: `${stagingDir}/file.m4b`, sizeBytes: 10 },
      ],
      fields: { title: "T", author: "A", series: "Foo" },
      mediaKind: "AUDIOBOOK",
    });

    const json = JSON.parse(await fs.readFile(`${targetDir}/metadata.json`, "utf8")) as {
      series: Array<{ name: string; sequence: string }>;
    };
    expect(json.series).toEqual([{ name: "Foo", sequence: "" }]);

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("writes audiobook sidecar with description when provided", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const targetDir = `${os.tmpdir()}/bookhouse-upload-test-${Math.random()}`;
    await fs.mkdir(targetDir, { recursive: true });
    const stagingDir = `${targetDir}-staging`;
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(`${stagingDir}/file.m4b`, "audio-bytes");

    await finalizeUpload({
      targetDir,
      files: [
        { basename: "file.m4b", mediaKind: MediaKind.AUDIO, stagingPath: `${stagingDir}/file.m4b`, sizeBytes: 10 },
      ],
      fields: { title: "T", author: "A", description: "A great book" },
      mediaKind: "AUDIOBOOK",
    });

    const json = JSON.parse(await fs.readFile(`${targetDir}/metadata.json`, "utf8")) as {
      description: string;
    };
    expect(json.description).toBe("A great book");

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  });
});
