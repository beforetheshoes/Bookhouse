import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const importJobCreateMock = vi.fn();
const externalLinkFindManyMock = vi.fn();
const workUpdateMock = vi.fn();
const workFindUniqueMock = vi.fn();
const enqueueLibraryJobMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: { create: importJobCreateMock },
    externalLink: { findMany: externalLinkFindManyMock },
    work: { update: workUpdateMock, findUnique: workFindUniqueMock },
  },
}));

vi.mock("@bookhouse/shared", () => ({
  enqueueLibraryJob: (...args: unknown[]): unknown => enqueueLibraryJobMock(...args),
}));

import {
  triggerEnrichmentServerFn,
  getEnrichmentDataServerFn,
  applyEnrichmentServerFn,
} from "./enrichment";

beforeEach(() => {
  importJobCreateMock.mockReset();
  externalLinkFindManyMock.mockReset();
  workUpdateMock.mockReset();
  workFindUniqueMock.mockReset();
  enqueueLibraryJobMock.mockReset();
});

describe("triggerEnrichmentServerFn", () => {
  it("creates an import job and enqueues a refresh-metadata job", async () => {
    importJobCreateMock.mockResolvedValue({ id: "ij-1" });
    enqueueLibraryJobMock.mockResolvedValue("job-1");

    const result = await triggerEnrichmentServerFn({
      data: { workId: "w1" },
    });

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "REFRESH_METADATA",
        status: "QUEUED",
        payload: { workId: "w1" },
      },
    });
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("refresh-metadata", {
      workId: "w1",
      importJobId: "ij-1",
    });
    expect(result).toEqual({ importJobId: "ij-1", queueJobId: "job-1" });
  });
});

describe("getEnrichmentDataServerFn", () => {
  it("returns external links for the work", async () => {
    const links = [
      {
        id: "el1",
        provider: "openlibrary",
        externalId: "OL123W",
        metadata: { title: "The Hobbit" },
        lastSyncedAt: new Date("2025-01-01"),
      },
    ];
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      editions: [{ id: "e1", externalLinks: links }],
    });

    const result = await getEnrichmentDataServerFn({
      data: { workId: "w1" },
    });

    expect(result).toEqual({ externalLinks: links });
  });

  it("returns empty array when work has no editions", async () => {
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      editions: [],
    });

    const result = await getEnrichmentDataServerFn({
      data: { workId: "w1" },
    });

    expect(result).toEqual({ externalLinks: [] });
  });

  it("returns empty array when work is not found", async () => {
    workFindUniqueMock.mockResolvedValue(null);

    const result = await getEnrichmentDataServerFn({
      data: { workId: "w1" },
    });

    expect(result).toEqual({ externalLinks: [] });
  });
});

describe("applyEnrichmentServerFn", () => {
  it("updates work with selected fields from enrichment", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        fields: { description: "A hobbit adventure" },
      },
    });

    expect(workFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      select: { editedFields: true },
    });
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { description: "A hobbit adventure" },
    });
    expect(result).toEqual({ success: true });
  });

  it("handles empty fields gracefully", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        fields: {},
      },
    });

    expect(workUpdateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("skips fields that were manually edited", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description"] });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        fields: { description: "New desc", sortTitle: "Sort" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { sortTitle: "Sort" },
    });
    expect(result).toEqual({ success: true });
  });

  it("skips all fields when all are manually edited", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description", "sortTitle"] });

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        fields: { description: "New desc", sortTitle: "Sort" },
      },
    });

    expect(workUpdateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("handles work not found gracefully for editedFields", async () => {
    workFindUniqueMock.mockResolvedValue(null);
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        fields: { description: "Desc" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { description: "Desc" },
    });
    expect(result).toEqual({ success: true });
  });
});
