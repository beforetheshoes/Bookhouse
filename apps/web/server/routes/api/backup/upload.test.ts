import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUploadRestoreHandler, type UploadRestoreHandlerDeps } from "./upload";
import type { BackupManifest } from "~/lib/backup/manifest";

const MOCK_MANIFEST: BackupManifest = {
  version: 1,
  timestamp: "2026-03-28T12:00:00.000Z",
  databaseSize: 100,
  coverCount: 5,
  coverSize: 500,
};

function createMockDeps(overrides: Partial<UploadRestoreHandlerDeps> = {}): UploadRestoreHandlerDeps {
  return {
    readFormData: vi.fn().mockResolvedValue([
      { name: "file", data: Buffer.from("archive-data"), type: "application/gzip" },
    ]),
    restoreBackup: vi.fn().mockResolvedValue({ manifest: MOCK_MANIFEST }),
    maxFileSize: 2 * 1024 * 1024 * 1024,
    ...overrides,
  };
}

function createMockEvent() {
  return {};
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("backup upload/restore handler", () => {
  it("calls restoreBackup with uploaded file data", async () => {
    const deps = createMockDeps();
    const handler = createUploadRestoreHandler(deps);

    await handler(createMockEvent() as never);

    expect(deps.restoreBackup).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("returns success with manifest on successful restore", async () => {
    const deps = createMockDeps();
    const handler = createUploadRestoreHandler(deps);

    const result = await handler(createMockEvent() as never);

    expect(result).toEqual({ success: true, manifest: MOCK_MANIFEST });
  });

  it("throws 400 when no file uploaded", async () => {
    const deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([]),
    });
    const handler = createUploadRestoreHandler(deps);

    await expect(handler(createMockEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when file data is empty", async () => {
    const deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: new Uint8Array(0) },
      ]),
    });
    const handler = createUploadRestoreHandler(deps);

    await expect(handler(createMockEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when file exceeds max size", async () => {
    const deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue([
        { name: "file", data: new Uint8Array(100), type: "application/gzip" },
      ]),
      maxFileSize: 50,
    });
    const handler = createUploadRestoreHandler(deps);

    await expect(handler(createMockEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when readFormData returns undefined", async () => {
    const deps = createMockDeps({
      readFormData: vi.fn().mockResolvedValue(undefined),
    });
    const handler = createUploadRestoreHandler(deps);

    await expect(handler(createMockEvent() as never)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("propagates restoreBackup errors", async () => {
    const deps = createMockDeps({
      restoreBackup: vi.fn().mockRejectedValue(new Error("invalid archive")),
    });
    const handler = createUploadRestoreHandler(deps);

    await expect(handler(createMockEvent() as never)).rejects.toThrow("invalid archive");
  });
});
