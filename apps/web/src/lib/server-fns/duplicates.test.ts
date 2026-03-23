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

const findManyMock = vi.fn();
const updateMock = vi.fn();
const findUniqueMock = vi.fn();
const deleteMock = vi.fn();
const transactionMock = vi.fn();
const editionFileUpdateManyMock = vi.fn();
const readingProgressUpdateManyMock = vi.fn();
const editionContributorFindManyMock = vi.fn();
const editionContributorCreateMock = vi.fn();
const editionContributorDeleteManyMock = vi.fn();
const editionDeleteMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    duplicateCandidate: {
      findMany: findManyMock,
      update: updateMock,
      findUnique: findUniqueMock,
    },
    editionFile: { updateMany: editionFileUpdateManyMock },
    readingProgress: { updateMany: readingProgressUpdateManyMock },
    editionContributor: {
      findMany: editionContributorFindManyMock,
      create: editionContributorCreateMock,
      deleteMany: editionContributorDeleteManyMock,
    },
    edition: { delete: editionDeleteMock },
    $transaction: transactionMock,
  },
}));

import {
  getDuplicatesServerFn,
  ignoreDuplicateServerFn,
  confirmDuplicateServerFn,
  mergeDuplicateServerFn,
} from "./duplicates";

beforeEach(() => {
  findManyMock.mockReset();
  updateMock.mockReset();
  findUniqueMock.mockReset();
  deleteMock.mockReset();
  transactionMock.mockReset();
  editionFileUpdateManyMock.mockReset();
  readingProgressUpdateManyMock.mockReset();
  editionContributorFindManyMock.mockReset();
  editionContributorCreateMock.mockReset();
  editionContributorDeleteManyMock.mockReset();
  editionDeleteMock.mockReset();
});

describe("getDuplicatesServerFn", () => {
  it("calls db.duplicateCandidate.findMany with correct includes and orderBy confidence desc", async () => {
    findManyMock.mockResolvedValue([]);
    await getDuplicatesServerFn({ data: {} });
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        leftEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
          },
        },
        rightEdition: {
          include: {
            work: true,
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
          },
        },
        leftFileAsset: true,
        rightFileAsset: true,
      },
      orderBy: { confidence: "desc" },
    });
  });

  it("returns the result from findMany", async () => {
    const fakeData = [{ id: "dup-1", confidence: 0.99, leftFileAsset: null, rightFileAsset: null }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getDuplicatesServerFn({ data: {} });
    expect(result).toEqual(fakeData);
  });

  it("filters by status when provided", async () => {
    findManyMock.mockResolvedValue([]);
    await getDuplicatesServerFn({ data: { status: "PENDING" } });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING" },
      }),
    );
  });

  it("excludes candidates where either side has a sidecar file", async () => {
    findManyMock.mockResolvedValue([
      { id: "dup-ok", leftFileAsset: { mediaKind: "EPUB" }, rightFileAsset: { mediaKind: "EPUB" }, leftEdition: null, rightEdition: null },
      { id: "dup-direct-sidecar", leftFileAsset: { mediaKind: "SIDECAR" }, rightFileAsset: { mediaKind: "EPUB" }, leftEdition: null, rightEdition: null },
      { id: "dup-left-edition-sidecar", leftFileAsset: null, rightFileAsset: null, leftEdition: { editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }], formatFamily: "EBOOK" }, rightEdition: { editionFiles: [], formatFamily: "EBOOK" } },
      { id: "dup-right-edition-sidecar", leftFileAsset: null, rightFileAsset: null, leftEdition: { editionFiles: [], formatFamily: "EBOOK" }, rightEdition: { editionFiles: [{ fileAsset: { mediaKind: "SIDECAR" } }], formatFamily: "EBOOK" } },
      { id: "dup-null-sides", leftFileAsset: null, rightFileAsset: null, leftEdition: null, rightEdition: null },
    ]);
    const result = await getDuplicatesServerFn({ data: {} });
    expect(result).toHaveLength(2);
    expect(result.map((r: { id: string }) => r.id)).toEqual(["dup-ok", "dup-null-sides"]);
  });

  it("does not filter cross-format candidates (handled at detection time)", async () => {
    findManyMock.mockResolvedValue([
      { id: "dup-cross", leftFileAsset: null, rightFileAsset: null, leftEdition: { editionFiles: [], formatFamily: "EBOOK" }, rightEdition: { editionFiles: [], formatFamily: "AUDIOBOOK" } },
    ]);
    const result = await getDuplicatesServerFn({ data: {} });
    expect(result).toHaveLength(1);
  });

  it("does not add where clause when status is not provided", async () => {
    findManyMock.mockResolvedValue([]);
    await getDuplicatesServerFn({ data: {} });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { confidence: "desc" } }),
    );
    const lastCallArgs = findManyMock.mock.lastCall as [Record<string, unknown>];
    expect("where" in lastCallArgs[0]).toBe(false);
  });
});

describe("ignoreDuplicateServerFn", () => {
  it("updates status to IGNORED", async () => {
    updateMock.mockResolvedValue({ id: "dup-1", status: "IGNORED" });
    const result = await ignoreDuplicateServerFn({ data: { id: "dup-1" } });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "dup-1" },
      data: { status: "IGNORED" },
    });
    expect(result).toEqual({ success: true });
  });
});

describe("confirmDuplicateServerFn", () => {
  it("updates status to CONFIRMED", async () => {
    updateMock.mockResolvedValue({ id: "dup-1", status: "CONFIRMED" });
    const result = await confirmDuplicateServerFn({ data: { id: "dup-1" } });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "dup-1" },
      data: { status: "CONFIRMED" },
    });
    expect(result).toEqual({ success: true });
  });
});

describe("mergeDuplicateServerFn", () => {
  it("throws if candidate not found", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(
      mergeDuplicateServerFn({
        data: { id: "dup-1", survivingEditionId: "ed-1" },
      }),
    ).rejects.toThrow("Duplicate candidate not found");
  });

  it("merges editions: moves files, progress, contributors, deletes loser, sets MERGED", async () => {
    findUniqueMock.mockResolvedValue({
      id: "dup-1",
      leftEditionId: "ed-1",
      rightEditionId: "ed-2",
    });
    // The transaction callback should be called with a function
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        editionFile: { updateMany: editionFileUpdateManyMock },
        readingProgress: { updateMany: readingProgressUpdateManyMock },
        editionContributor: {
          findMany: editionContributorFindManyMock,
          create: editionContributorCreateMock,
          deleteMany: editionContributorDeleteManyMock,
        },
        edition: { delete: editionDeleteMock },
        duplicateCandidate: { update: updateMock },
      };
      await fn(tx);
    });

    editionContributorFindManyMock.mockResolvedValue([
      { contributorId: "c1", role: "AUTHOR" },
      { contributorId: "c2", role: "NARRATOR" },
    ]);
    // Surviving edition already has c1/AUTHOR
    editionContributorCreateMock
      .mockRejectedValueOnce({ code: "P2002" }) // unique constraint for c1
      .mockResolvedValueOnce({ id: "ec-new" }); // c2 is new

    const result = await mergeDuplicateServerFn({
      data: { id: "dup-1", survivingEditionId: "ed-1" },
    });

    // losing edition is ed-2 (the one that is NOT survivingEditionId)
    expect(editionFileUpdateManyMock).toHaveBeenCalledWith({
      where: { editionId: "ed-2" },
      data: { editionId: "ed-1" },
    });
    expect(readingProgressUpdateManyMock).toHaveBeenCalledWith({
      where: { editionId: "ed-2" },
      data: { editionId: "ed-1" },
    });
    expect(editionContributorFindManyMock).toHaveBeenCalledWith({
      where: { editionId: "ed-2" },
    });
    expect(editionContributorCreateMock).toHaveBeenCalledTimes(2);
    expect(editionContributorDeleteManyMock).toHaveBeenCalledWith({
      where: { editionId: "ed-2" },
    });
    expect(editionDeleteMock).toHaveBeenCalledWith({
      where: { id: "ed-2" },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "dup-1" },
      data: { status: "MERGED" },
    });
    expect(result).toEqual({ success: true });
  });

  it("handles merge when surviving edition is the right one", async () => {
    findUniqueMock.mockResolvedValue({
      id: "dup-1",
      leftEditionId: "ed-1",
      rightEditionId: "ed-2",
    });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        editionFile: { updateMany: editionFileUpdateManyMock },
        readingProgress: { updateMany: readingProgressUpdateManyMock },
        editionContributor: {
          findMany: editionContributorFindManyMock,
          create: editionContributorCreateMock,
          deleteMany: editionContributorDeleteManyMock,
        },
        edition: { delete: editionDeleteMock },
        duplicateCandidate: { update: updateMock },
      };
      await fn(tx);
    });
    editionContributorFindManyMock.mockResolvedValue([]);

    await mergeDuplicateServerFn({
      data: { id: "dup-1", survivingEditionId: "ed-2" },
    });

    // losing edition is ed-1
    expect(editionFileUpdateManyMock).toHaveBeenCalledWith({
      where: { editionId: "ed-1" },
      data: { editionId: "ed-2" },
    });
    expect(editionDeleteMock).toHaveBeenCalledWith({
      where: { id: "ed-1" },
    });
  });

  it("skips contributor create silently on unique constraint violation", async () => {
    findUniqueMock.mockResolvedValue({
      id: "dup-1",
      leftEditionId: "ed-1",
      rightEditionId: "ed-2",
    });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        editionFile: { updateMany: editionFileUpdateManyMock },
        readingProgress: { updateMany: readingProgressUpdateManyMock },
        editionContributor: {
          findMany: editionContributorFindManyMock,
          create: editionContributorCreateMock,
          deleteMany: editionContributorDeleteManyMock,
        },
        edition: { delete: editionDeleteMock },
        duplicateCandidate: { update: updateMock },
      };
      await fn(tx);
    });
    editionContributorFindManyMock.mockResolvedValue([
      { contributorId: "c1", role: "AUTHOR" },
    ]);
    editionContributorCreateMock.mockRejectedValueOnce({ code: "P2002" });

    // Should not throw
    await mergeDuplicateServerFn({
      data: { id: "dup-1", survivingEditionId: "ed-1" },
    });

    expect(editionContributorCreateMock).toHaveBeenCalledTimes(1);
  });

  it("re-throws non-unique-constraint errors", async () => {
    findUniqueMock.mockResolvedValue({
      id: "dup-1",
      leftEditionId: "ed-1",
      rightEditionId: "ed-2",
    });
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        editionFile: { updateMany: editionFileUpdateManyMock },
        readingProgress: { updateMany: readingProgressUpdateManyMock },
        editionContributor: {
          findMany: editionContributorFindManyMock,
          create: editionContributorCreateMock,
          deleteMany: editionContributorDeleteManyMock,
        },
        edition: { delete: editionDeleteMock },
        duplicateCandidate: { update: updateMock },
      };
      await fn(tx);
    });
    editionContributorFindManyMock.mockResolvedValue([
      { contributorId: "c1", role: "AUTHOR" },
    ]);
    editionContributorCreateMock.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      mergeDuplicateServerFn({
        data: { id: "dup-1", survivingEditionId: "ed-1" },
      }),
    ).rejects.toThrow("DB connection lost");
  });
});
