import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: <T>(fn: (a: { data: T }) => Promise<{ importJobId: string; enqueuedCount: number }>) => (a: { data: T }) => Promise<{ importJobId: string; enqueuedCount: number }>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const importJobCreateMock = vi.fn().mockResolvedValue({ id: "ij-1" });
vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: {
      create: importJobCreateMock,
    },
  },
}));

const enqueueEnrichmentJobMock = vi.fn().mockResolvedValue("job-id");
vi.mock("@bookhouse/shared", () => ({
  enqueueEnrichmentJob: enqueueEnrichmentJobMock,
}));

import { bulkEnrichServerFn } from "./bulk-enrich";

beforeEach(() => {
  importJobCreateMock.mockReset();
  importJobCreateMock.mockResolvedValue({ id: "ij-1" });
  enqueueEnrichmentJobMock.mockReset();
  enqueueEnrichmentJobMock.mockResolvedValue("job-id");
});

describe("bulkEnrichServerFn", () => {
  it("creates an ImportJob and enqueues jobs for each work", async () => {
    const result = await bulkEnrichServerFn({
      data: {
        workIds: ["w1", "w2", "w3"],
        sources: ["openlibrary", "hardcover"],
        strategy: "fullest",
      },
    });

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "BULK_ENRICH",
        status: "QUEUED",
        totalFiles: 3,
        processedFiles: 0,
        errorCount: 0,
        payload: { sources: ["openlibrary", "hardcover"], strategy: "fullest" },
      },
    });

    expect(enqueueEnrichmentJobMock).toHaveBeenCalledTimes(3);
    expect(enqueueEnrichmentJobMock).toHaveBeenCalledWith("bulk-enrich-metadata", {
      workId: "w1",
      sources: ["openlibrary", "hardcover"],
      strategy: "fullest",
      importJobId: "ij-1",
    });

    expect(result).toEqual({ importJobId: "ij-1", enqueuedCount: 3 });
  });

  it("handles single work with priority strategy", async () => {
    const result = await bulkEnrichServerFn({
      data: {
        workIds: ["w1"],
        sources: ["openlibrary"],
        strategy: "priority",
      },
    });

    expect(enqueueEnrichmentJobMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ importJobId: "ij-1", enqueuedCount: 1 });
  });
});
