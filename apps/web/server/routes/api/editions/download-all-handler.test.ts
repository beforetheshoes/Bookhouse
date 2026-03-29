import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { createDownloadAllHandler, type DownloadAllHandlerDeps } from "./download-all-handler";

const MOCK_EDITION_FILES = [
  {
    id: "ef1",
    fileAsset: {
      absolutePath: "/books/track01.mp3",
      basename: "track01.mp3",
      mimeType: "audio/mpeg",
      mediaKind: "AUDIO",
      availabilityStatus: "PRESENT",
    },
  },
  {
    id: "ef2",
    fileAsset: {
      absolutePath: "/books/track02.mp3",
      basename: "track02.mp3",
      mimeType: "audio/mpeg",
      mediaKind: "AUDIO",
      availabilityStatus: "PRESENT",
    },
  },
];

function createMockArchive() {
  const archive = new PassThrough();
  const appendMock = vi.fn().mockReturnValue(archive);
  const finalizeMock = vi.fn().mockImplementation(() => {
    archive.end();
    return Promise.resolve();
  });
  return Object.assign(archive, { append: appendMock, finalize: finalizeMock });
}

function createMockDeps(overrides: Partial<DownloadAllHandlerDeps> = {}): DownloadAllHandlerDeps {
  return {
    db: {
      findEditionFiles: vi.fn().mockResolvedValue(MOCK_EDITION_FILES),
    },
    existsSync: vi.fn().mockReturnValue(true),
    createReadStream: vi.fn().mockReturnValue(Readable.from(Buffer.from("audio-data"))),
    createArchive: vi.fn().mockReturnValue(createMockArchive()),
    setResponseHeader: vi.fn(),
    sendStream: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function createMockEvent(editionId: string) {
  return { context: { params: { editionId } } };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("download-all handler", () => {
  it("throws 400 for invalid editionId", async () => {
    const deps = createMockDeps();
    const handler = createDownloadAllHandler(deps);

    await expect(handler(createMockEvent("../bad") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("throws 404 when no PRESENT files found", async () => {
    const deps = createMockDeps({
      db: { findEditionFiles: vi.fn().mockResolvedValue([]) },
    });
    const handler = createDownloadAllHandler(deps);

    await expect(handler(createMockEvent("ed1") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("excludes sidecar files from the archive", async () => {
    const mockArchive = createMockArchive();
    const deps = createMockDeps({
      createArchive: vi.fn().mockReturnValue(mockArchive),
      db: {
        findEditionFiles: vi.fn().mockResolvedValue([
          ...MOCK_EDITION_FILES,
          {
            id: "ef3",
            fileAsset: {
              absolutePath: "/books/metadata.json",
              basename: "metadata.json",
              mimeType: "application/json",
              mediaKind: "SIDECAR",
              availabilityStatus: "PRESENT",
            },
          },
          {
            id: "ef4",
            fileAsset: {
              absolutePath: "/books/cover.jpg",
              basename: "cover.jpg",
              mimeType: "image/jpeg",
              mediaKind: "COVER",
              availabilityStatus: "PRESENT",
            },
          },
          {
            id: "ef5",
            fileAsset: {
              absolutePath: "/books/unknown.dat",
              basename: "unknown.dat",
              mimeType: null,
              mediaKind: "OTHER",
              availabilityStatus: "PRESENT",
            },
          },
        ]),
      },
    });
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(mockArchive.append).toHaveBeenCalledTimes(2);
    expect(mockArchive.append).toHaveBeenCalledWith(expect.anything(), { name: "track01.mp3" });
    expect(mockArchive.append).toHaveBeenCalledWith(expect.anything(), { name: "track02.mp3" });
  });

  it("throws 404 when only non-content files exist", async () => {
    const deps = createMockDeps({
      db: {
        findEditionFiles: vi.fn().mockResolvedValue([
          {
            id: "ef1",
            fileAsset: {
              absolutePath: "/books/metadata.json",
              basename: "metadata.json",
              mimeType: "application/json",
              mediaKind: "SIDECAR",
              availabilityStatus: "PRESENT",
            },
          },
        ]),
      },
    });
    const handler = createDownloadAllHandler(deps);

    await expect(handler(createMockEvent("ed1") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("appends each PRESENT file to the archive", async () => {
    const mockArchive = createMockArchive();
    const stream1 = Readable.from(Buffer.from("track1"));
    const stream2 = Readable.from(Buffer.from("track2"));
    const deps = createMockDeps({
      createArchive: vi.fn().mockReturnValue(mockArchive),
      createReadStream: vi.fn()
        .mockReturnValueOnce(stream1)
        .mockReturnValueOnce(stream2),
    });
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(mockArchive.append).toHaveBeenCalledWith(stream1, { name: "track01.mp3" });
    expect(mockArchive.append).toHaveBeenCalledWith(stream2, { name: "track02.mp3" });
  });

  it("skips files that do not exist on disk", async () => {
    const mockArchive = createMockArchive();
    const deps = createMockDeps({
      createArchive: vi.fn().mockReturnValue(mockArchive),
      existsSync: vi.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
    });
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(mockArchive.append).toHaveBeenCalledTimes(1);
    expect(mockArchive.append).toHaveBeenCalledWith(expect.anything(), { name: "track02.mp3" });
  });

  it("throws 404 when all files are missing from disk", async () => {
    const deps = createMockDeps({
      existsSync: vi.fn().mockReturnValue(false),
    });
    const handler = createDownloadAllHandler(deps);

    await expect(handler(createMockEvent("ed1") as never)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("calls finalize on the archive", async () => {
    const mockArchive = createMockArchive();
    const deps = createMockDeps({
      createArchive: vi.fn().mockReturnValue(mockArchive),
    });
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(mockArchive.finalize).toHaveBeenCalled();
  });

  it("sets Content-Type to application/zip", async () => {
    const deps = createMockDeps();
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/zip",
    );
  });

  it("sets Content-Disposition with editionId in filename", async () => {
    const deps = createMockDeps();
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Disposition",
      'attachment; filename="ed1.zip"',
    );
  });

  it("sets Cache-Control to private, no-cache", async () => {
    const deps = createMockDeps();
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Cache-Control",
      "private, no-cache",
    );
  });

  it("sends the archive stream", async () => {
    const mockArchive = createMockArchive();
    const deps = createMockDeps({
      createArchive: vi.fn().mockReturnValue(mockArchive),
    });
    const handler = createDownloadAllHandler(deps);

    await handler(createMockEvent("ed1") as never);

    expect(deps.sendStream).toHaveBeenCalledWith(expect.anything(), mockArchive);
  });
});
