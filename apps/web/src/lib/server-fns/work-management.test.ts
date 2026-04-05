import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: object) => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const mergeWorksByIdMock = vi.fn();

vi.mock("@bookhouse/ingest", () => ({
  mergeWorksById: mergeWorksByIdMock,
}));

const editionFindUniqueMock = vi.fn();
const editionCreateMock = vi.fn();
const editionUpdateMock = vi.fn();
const editionCountMock = vi.fn();
const workCreateMock = vi.fn();
const editionFileFindManyMock = vi.fn();
const editionFileUpdateManyMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    edition: {
      findUnique: editionFindUniqueMock,
      create: editionCreateMock,
      update: editionUpdateMock,
      count: editionCountMock,
    },
    work: {
      create: workCreateMock,
    },
    editionFile: {
      findMany: editionFileFindManyMock,
      updateMany: editionFileUpdateManyMock,
    },
  },
}));

import { mergeWorksServerFn, splitEditionToWorkServerFn, splitEditionFilesServerFn } from "./work-management";

beforeEach(() => {
  mergeWorksByIdMock.mockReset();
  editionFindUniqueMock.mockReset();
  editionCreateMock.mockReset();
  editionUpdateMock.mockReset();
  editionCountMock.mockReset();
  workCreateMock.mockReset();
  editionFileFindManyMock.mockReset();
  editionFileUpdateManyMock.mockReset();
});

describe("mergeWorksServerFn", () => {
  it("calls mergeWorksById for each source work", async () => {
    mergeWorksByIdMock.mockResolvedValue(undefined);

    const result = await mergeWorksServerFn({
      data: { targetWorkId: "w1", sourceWorkIds: ["w2", "w3"] },
    });

    expect(mergeWorksByIdMock).toHaveBeenCalledTimes(2);
    expect(mergeWorksByIdMock).toHaveBeenNthCalledWith(1, "w1", "w2");
    expect(mergeWorksByIdMock).toHaveBeenNthCalledWith(2, "w1", "w3");
    expect(result).toEqual({ targetWorkId: "w1", mergedWorkIds: ["w2", "w3"] });
  });

  it("handles a single source work", async () => {
    mergeWorksByIdMock.mockResolvedValue(undefined);

    const result = await mergeWorksServerFn({
      data: { targetWorkId: "w1", sourceWorkIds: ["w2"] },
    });

    expect(mergeWorksByIdMock).toHaveBeenCalledTimes(1);
    expect(mergeWorksByIdMock).toHaveBeenCalledWith("w1", "w2");
    expect(result).toEqual({ targetWorkId: "w1", mergedWorkIds: ["w2"] });
  });

  it("throws when targetWorkId is in sourceWorkIds", async () => {
    await expect(
      mergeWorksServerFn({
        data: { targetWorkId: "w1", sourceWorkIds: ["w1", "w2"] },
      }),
    ).rejects.toThrow("Target work cannot be in source works");
  });

  it("propagates errors from mergeWorksById", async () => {
    mergeWorksByIdMock.mockRejectedValue(new Error("Cannot merge: work not found"));

    await expect(
      mergeWorksServerFn({
        data: { targetWorkId: "w1", sourceWorkIds: ["w2"] },
      }),
    ).rejects.toThrow("Cannot merge: work not found");
  });
});

describe("splitEditionToWorkServerFn", () => {
  it("creates a new work and re-parents the edition", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      work: {
        id: "w1",
        titleCanonical: "the great gatsby",
        titleDisplay: "The Great Gatsby",
        coverPath: "/covers/w1.jpg",
        coverColors: { dominant: "#fff" },
      },
    });
    editionCountMock.mockResolvedValue(3);
    workCreateMock.mockResolvedValue({ id: "w-new" });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    const result = await splitEditionToWorkServerFn({
      data: { editionId: "e1" },
    });

    expect(workCreateMock).toHaveBeenCalledWith({
      data: {
        titleCanonical: "the great gatsby",
        titleDisplay: "The Great Gatsby",
        coverPath: "/covers/w1.jpg",
        coverColors: { dominant: "#fff" },
        enrichmentStatus: "STUB",
      },
    });
    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { workId: "w-new" },
    });
    expect(result).toEqual({ newWorkId: "w-new", editionId: "e1" });
  });

  it("throws when edition not found", async () => {
    editionFindUniqueMock.mockResolvedValue(null);

    await expect(
      splitEditionToWorkServerFn({ data: { editionId: "e-missing" } }),
    ).rejects.toThrow("Edition not found");
  });

  it("throws when work has only 1 edition", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      work: { id: "w1", titleCanonical: "test", titleDisplay: "Test", coverPath: null, coverColors: null },
    });
    editionCountMock.mockResolvedValue(1);

    await expect(
      splitEditionToWorkServerFn({ data: { editionId: "e1" } }),
    ).rejects.toThrow("Cannot split the only edition");
  });

  it("handles null cover fields gracefully", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      work: { id: "w1", titleCanonical: "test", titleDisplay: "Test", coverPath: null, coverColors: null },
    });
    editionCountMock.mockResolvedValue(2);
    workCreateMock.mockResolvedValue({ id: "w-new" });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    await splitEditionToWorkServerFn({ data: { editionId: "e1" } });

    expect(workCreateMock).toHaveBeenCalledWith({
      data: {
        titleCanonical: "test",
        titleDisplay: "Test",
        coverPath: null,
        enrichmentStatus: "STUB",
      },
    });
  });
});

describe("splitEditionFilesServerFn", () => {
  it("creates a new edition and moves selected files", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      formatFamily: "AUDIOBOOK",
      editionFiles: [
        { id: "ef1", fileAssetId: "fa1" },
        { id: "ef2", fileAssetId: "fa2" },
        { id: "ef3", fileAssetId: "fa3" },
      ],
    });
    editionCreateMock.mockResolvedValue({ id: "e-new" });
    editionFileUpdateManyMock.mockResolvedValue({ count: 1 });

    const result = await splitEditionFilesServerFn({
      data: { editionId: "e1", editionFileIds: ["ef2"] },
    });

    expect(editionCreateMock).toHaveBeenCalledWith({
      data: { workId: "w1", formatFamily: "AUDIOBOOK" },
    });
    expect(editionFileUpdateManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["ef2"] } },
      data: { editionId: "e-new" },
    });
    expect(result).toEqual({ newEditionId: "e-new", movedFileCount: 1 });
  });

  it("throws when edition not found", async () => {
    editionFindUniqueMock.mockResolvedValue(null);

    await expect(
      splitEditionFilesServerFn({
        data: { editionId: "e-missing", editionFileIds: ["ef1"] },
      }),
    ).rejects.toThrow("Edition not found");
  });

  it("throws when edition has fewer than 2 files", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      formatFamily: "EBOOK",
      editionFiles: [{ id: "ef1", fileAssetId: "fa1" }],
    });

    await expect(
      splitEditionFilesServerFn({
        data: { editionId: "e1", editionFileIds: ["ef1"] },
      }),
    ).rejects.toThrow("Edition must have at least 2 files to split");
  });

  it("throws when attempting to move all files", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      formatFamily: "EBOOK",
      editionFiles: [
        { id: "ef1", fileAssetId: "fa1" },
        { id: "ef2", fileAssetId: "fa2" },
      ],
    });

    await expect(
      splitEditionFilesServerFn({
        data: { editionId: "e1", editionFileIds: ["ef1", "ef2"] },
      }),
    ).rejects.toThrow("Cannot move all files");
  });

  it("throws when editionFileIds contain IDs not in this edition", async () => {
    editionFindUniqueMock.mockResolvedValue({
      id: "e1",
      workId: "w1",
      formatFamily: "EBOOK",
      editionFiles: [
        { id: "ef1", fileAssetId: "fa1" },
        { id: "ef2", fileAssetId: "fa2" },
      ],
    });

    await expect(
      splitEditionFilesServerFn({
        data: { editionId: "e1", editionFileIds: ["ef-foreign"] },
      }),
    ).rejects.toThrow("Some file IDs do not belong to this edition");
  });
});
