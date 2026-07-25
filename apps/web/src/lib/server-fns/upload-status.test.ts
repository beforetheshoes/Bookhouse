import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_guards", () => ({
  authenticatedOnly: vi.fn().mockResolvedValue({ id: "user-1", roles: ["OWNER"] }),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      validator: (schema: object) => Builder;
      handler: <T>(fn: (a: { data: { importJobId: string } }) => T | Promise<T>) => (a: { data: { importJobId: string } }) => T | Promise<T>;
    };
    const b: Builder = {
      validator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const importJobFindUniqueMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      findUnique: importJobFindUniqueMock,
    },
  },
}));

import { getUploadStatusServerFn } from "./upload-status";

beforeEach(() => {
  importJobFindUniqueMock.mockReset();
});

describe("getUploadStatusServerFn", () => {
  it("returns null when the ImportJob does not exist", async () => {
    importJobFindUniqueMock.mockResolvedValue(null);
    const result = await getUploadStatusServerFn({ data: { importJobId: "missing" } });
    expect(result).toBeNull();
  });

  it("returns null when the ImportJob is not an UPLOAD_INGEST job", async () => {
    importJobFindUniqueMock.mockResolvedValue({
      id: "j1",
      kind: "SCAN_ROOT",
      status: "RUNNING",
      processedFiles: 0,
      totalFiles: 0,
      errorCount: 0,
      error: null,
    });
    const result = await getUploadStatusServerFn({ data: { importJobId: "j1" } });
    expect(result).toBeNull();
  });

  it("returns RUNNING status with progress fields", async () => {
    importJobFindUniqueMock.mockResolvedValue({
      id: "j1",
      kind: "UPLOAD_INGEST",
      status: "RUNNING",
      processedFiles: 2,
      totalFiles: 5,
      errorCount: 0,
      error: null,
    });
    const result = await getUploadStatusServerFn({ data: { importJobId: "j1" } });
    expect(result).toEqual({
      status: "RUNNING",
      processedFiles: 2,
      totalFiles: 5,
      errorCount: 0,
    });
  });

  it("returns QUEUED status", async () => {
    importJobFindUniqueMock.mockResolvedValue({
      id: "j1",
      kind: "UPLOAD_INGEST",
      status: "QUEUED",
      processedFiles: 0,
      totalFiles: 0,
      errorCount: 0,
      error: null,
    });
    const result = await getUploadStatusServerFn({ data: { importJobId: "j1" } });
    expect(result).toEqual({
      status: "QUEUED",
      processedFiles: 0,
      totalFiles: 0,
      errorCount: 0,
    });
  });

  it("returns SUCCEEDED status when the job has completed", async () => {
    importJobFindUniqueMock.mockResolvedValue({
      id: "j1",
      kind: "UPLOAD_INGEST",
      status: "SUCCEEDED",
      processedFiles: 5,
      totalFiles: 5,
      errorCount: 0,
      error: null,
    });
    const result = await getUploadStatusServerFn({ data: { importJobId: "j1" } });
    expect(result).toEqual({
      status: "SUCCEEDED",
      processedFiles: 5,
      totalFiles: 5,
      errorCount: 0,
    });
  });

  it("returns FAILED status with the error message", async () => {
    importJobFindUniqueMock.mockResolvedValue({
      id: "j1",
      kind: "UPLOAD_INGEST",
      status: "FAILED",
      processedFiles: 2,
      totalFiles: 5,
      errorCount: 3,
      error: "disk full",
    });
    const result = await getUploadStatusServerFn({ data: { importJobId: "j1" } });
    expect(result).toEqual({
      status: "FAILED",
      error: "disk full",
      processedFiles: 2,
      totalFiles: 5,
      errorCount: 3,
    });
  });
});
