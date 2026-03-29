import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { createFileDownloadHandler, type FileDownloadHandlerDeps } from "./handler";

const MOCK_FILE_ASSET = {
  absolutePath: "/books/wind.epub",
  basename: "wind.epub",
  mimeType: "application/epub+zip",
  availabilityStatus: "PRESENT" as const,
};

function createMockDeps(overrides: Partial<FileDownloadHandlerDeps> = {}): FileDownloadHandlerDeps {
  return {
    db: {
      findEditionFile: vi.fn().mockResolvedValue({ fileAsset: MOCK_FILE_ASSET }),
    },
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue(Readable.from(Buffer.from("file-data"))),
    setResponseHeader: vi.fn(),
    sendStream: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function createMockEvent(editionFileId: string) {
  return { context: { params: { editionFileId } } };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("file download handler", () => {
  it("streams file for valid PRESENT editionFile", async () => {
    const mockStream = Readable.from(Buffer.from("epub-data"));
    const deps = createMockDeps({
      createReadStream: vi.fn().mockReturnValue(mockStream),
    });
    const handler = createFileDownloadHandler(deps);

    await handler(createMockEvent("ef1") as never);

    expect(deps.db.findEditionFile).toHaveBeenCalledWith("ef1");
    expect(deps.existsSync).toHaveBeenCalledWith("/books/wind.epub");
    expect(deps.createReadStream).toHaveBeenCalledWith("/books/wind.epub");
    expect(deps.sendStream).toHaveBeenCalledWith(expect.anything(), mockStream);
  });

  it("sets Content-Type from fileAsset.mimeType", async () => {
    const deps = createMockDeps();
    const handler = createFileDownloadHandler(deps);

    await handler(createMockEvent("ef1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/epub+zip",
    );
  });

  it("falls back to application/octet-stream when mimeType is null", async () => {
    const deps = createMockDeps({
      db: {
        findEditionFile: vi.fn().mockResolvedValue({
          fileAsset: { ...MOCK_FILE_ASSET, mimeType: null },
        }),
      },
    });
    const handler = createFileDownloadHandler(deps);

    await handler(createMockEvent("ef1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/octet-stream",
    );
  });

  it("sets Content-Disposition with basename", async () => {
    const deps = createMockDeps();
    const handler = createFileDownloadHandler(deps);

    await handler(createMockEvent("ef1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Disposition",
      'attachment; filename="wind.epub"',
    );
  });

  it("sets Cache-Control to private, no-cache", async () => {
    const deps = createMockDeps();
    const handler = createFileDownloadHandler(deps);

    await handler(createMockEvent("ef1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Cache-Control",
      "private, no-cache",
    );
  });

  it("throws 400 for invalid editionFileId", async () => {
    const deps = createMockDeps();
    const handler = createFileDownloadHandler(deps);

    await expect(handler(createMockEvent("../../../etc/passwd") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("throws 404 when editionFile not found in DB", async () => {
    const deps = createMockDeps({
      db: { findEditionFile: vi.fn().mockResolvedValue(null) },
    });
    const handler = createFileDownloadHandler(deps);

    await expect(handler(createMockEvent("ef-missing") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("throws 404 when availabilityStatus is MISSING", async () => {
    const deps = createMockDeps({
      db: {
        findEditionFile: vi.fn().mockResolvedValue({
          fileAsset: { ...MOCK_FILE_ASSET, availabilityStatus: "MISSING" },
        }),
      },
    });
    const handler = createFileDownloadHandler(deps);

    await expect(handler(createMockEvent("ef1") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("throws 404 when availabilityStatus is IGNORED", async () => {
    const deps = createMockDeps({
      db: {
        findEditionFile: vi.fn().mockResolvedValue({
          fileAsset: { ...MOCK_FILE_ASSET, availabilityStatus: "IGNORED" },
        }),
      },
    });
    const handler = createFileDownloadHandler(deps);

    await expect(handler(createMockEvent("ef1") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("throws 404 when file does not exist on disk despite PRESENT status", async () => {
    const deps = createMockDeps({
      existsSync: vi.fn().mockReturnValue(false),
    });
    const handler = createFileDownloadHandler(deps);

    await expect(handler(createMockEvent("ef1") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});
