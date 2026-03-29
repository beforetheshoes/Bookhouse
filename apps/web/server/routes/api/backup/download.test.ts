import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import { createDownloadHandler, type DownloadHandlerDeps } from "./download";
import type { BackupManifest } from "~/lib/backup/manifest";

const MOCK_MANIFEST: BackupManifest = {
  version: 1,
  timestamp: "2026-03-28T12:00:00.000Z",
  databaseSize: 100,
  coverCount: 5,
  coverSize: 500,
};

function createMockDeps(overrides: Partial<DownloadHandlerDeps> = {}): DownloadHandlerDeps {
  return {
    createBackup: vi.fn().mockResolvedValue({
      stream: Readable.from(Buffer.from("fake-archive")),
      manifest: MOCK_MANIFEST,
    }) as DownloadHandlerDeps["createBackup"],
    setResponseHeader: vi.fn(),
    sendStream: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function createMockEvent() {
  return {};
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("backup download handler", () => {
  it("calls createBackup", async () => {
    const deps = createMockDeps();
    const handler = createDownloadHandler(deps);

    await handler(createMockEvent() as never);

    expect(deps.createBackup).toHaveBeenCalled();
  });

  it("sets Content-Type to application/gzip", async () => {
    const deps = createMockDeps();
    const handler = createDownloadHandler(deps);

    await handler(createMockEvent() as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Type",
      "application/gzip",
    );
  });

  it("sets Content-Disposition with timestamp in filename", async () => {
    const deps = createMockDeps();
    const handler = createDownloadHandler(deps);

    await handler(createMockEvent() as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "Content-Disposition",
      expect.stringMatching(/^attachment; filename="bookhouse-backup-\d{4}-\d{2}-\d{2}T.+\.tar\.gz"$/),
    );
  });

  it("sets x-backup-manifest header with serialized manifest", async () => {
    const deps = createMockDeps();
    const handler = createDownloadHandler(deps);

    await handler(createMockEvent() as never);

    expect(deps.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      "x-backup-manifest",
      JSON.stringify(MOCK_MANIFEST),
    );
  });

  it("sends the backup stream", async () => {
    const mockStream = Readable.from(Buffer.from("data"));
    const deps = createMockDeps({
      createBackup: vi.fn().mockResolvedValue({
        stream: mockStream,
        manifest: MOCK_MANIFEST,
      }),
    });
    const handler = createDownloadHandler(deps);

    await handler(createMockEvent() as never);

    expect(deps.sendStream).toHaveBeenCalledWith(expect.anything(), mockStream);
  });

  it("propagates createBackup errors", async () => {
    const deps = createMockDeps({
      createBackup: vi.fn().mockRejectedValue(new Error("pg_dump failed")),
    });
    const handler = createDownloadHandler(deps);

    await expect(handler(createMockEvent() as never)).rejects.toThrow("pg_dump failed");
  });
});
