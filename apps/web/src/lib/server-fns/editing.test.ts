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

const workFindUniqueMock = vi.fn();
const workUpdateMock = vi.fn();
const editionFindUniqueMock = vi.fn();
const editionUpdateMock = vi.fn();
const editionFindManyMock = vi.fn();
const contributorFindFirstMock = vi.fn();
const contributorCreateMock = vi.fn();
const contributorFindManyMock = vi.fn();
const editionContributorDeleteManyMock = vi.fn();
const editionContributorCreateManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: {
      findUnique: workFindUniqueMock,
      update: workUpdateMock,
    },
    edition: {
      findUnique: editionFindUniqueMock,
      findMany: editionFindManyMock,
      update: editionUpdateMock,
    },
    contributor: {
      findFirst: contributorFindFirstMock,
      findMany: contributorFindManyMock,
      create: contributorCreateMock,
    },
    editionContributor: {
      deleteMany: editionContributorDeleteManyMock,
      createMany: editionContributorCreateManyMock,
    },
    $transaction: transactionMock,
  },
}));

const canonicalizeBookTitleMock = vi.fn();
const canonicalizeContributorNameMock = vi.fn();

vi.mock("@bookhouse/ingest", () => ({
  canonicalizeBookTitle: canonicalizeBookTitleMock,
  canonicalizeContributorName: canonicalizeContributorNameMock,
}));

import {
  updateWorkServerFn,
  updateEditionServerFn,
  updateWorkAuthorsServerFn,
  getContributorNamesServerFn,
} from "./editing";

beforeEach(() => {
  workFindUniqueMock.mockReset();
  workUpdateMock.mockReset();
  editionFindUniqueMock.mockReset();
  editionUpdateMock.mockReset();
  editionFindManyMock.mockReset();
  contributorFindFirstMock.mockReset();
  contributorCreateMock.mockReset();
  editionContributorDeleteManyMock.mockReset();
  editionContributorCreateManyMock.mockReset();
  transactionMock.mockReset();
  canonicalizeBookTitleMock.mockReset();
  canonicalizeContributorNameMock.mockReset();
});

describe("updateWorkServerFn", () => {
  it("updates work with provided fields and tracks editedFields", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await updateWorkServerFn({
      data: {
        workId: "w1",
        fields: { description: "Updated description" },
      },
    });

    expect(workFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      select: { editedFields: true },
    });
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        description: "Updated description",
        editedFields: ["description"],
      },
    });
    expect(result).toEqual({ success: true });
  });

  it("recomputes titleCanonical when titleDisplay changes", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    canonicalizeBookTitleMock.mockReturnValue("new title");

    await updateWorkServerFn({
      data: {
        workId: "w1",
        fields: { titleDisplay: "New Title" },
      },
    });

    expect(canonicalizeBookTitleMock).toHaveBeenCalledWith("New Title");
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        titleDisplay: "New Title",
        titleCanonical: "new title",
        editedFields: ["titleDisplay"],
      },
    });
  });

  it("merges editedFields with existing values without duplicates", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description"] });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkServerFn({
      data: {
        workId: "w1",
        fields: { description: "Updated", sortTitle: "Sort" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        description: "Updated",
        sortTitle: "Sort",
        editedFields: ["description", "sortTitle"],
      },
    });
  });

  it("handles work not found for editedFields gracefully", async () => {
    workFindUniqueMock.mockResolvedValue(null);
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkServerFn({
      data: {
        workId: "w1",
        fields: { description: "Updated" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: {
        description: "Updated",
        editedFields: ["description"],
      },
    });
  });

  it("throws when titleDisplay is blank", async () => {
    await expect(
      updateWorkServerFn({
        data: {
          workId: "w1",
          fields: { titleDisplay: "   " },
        },
      }),
    ).rejects.toThrow("Title cannot be blank");
  });

  it("throws when titleDisplay is empty string", async () => {
    await expect(
      updateWorkServerFn({
        data: {
          workId: "w1",
          fields: { titleDisplay: "" },
        },
      }),
    ).rejects.toThrow("Title cannot be blank");
  });
});

describe("updateEditionServerFn", () => {
  it("updates edition with provided fields and tracks editedFields", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    const result = await updateEditionServerFn({
      data: {
        editionId: "e1",
        fields: { isbn13: "9780756404079", language: "en" },
      },
    });

    expect(editionFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      select: { editedFields: true },
    });
    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        isbn13: "9780756404079",
        language: "en",
        editedFields: ["isbn13", "language"],
      },
    });
    expect(result).toEqual({ success: true });
  });

  it("parses publishedAt string to Date", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    await updateEditionServerFn({
      data: {
        editionId: "e1",
        fields: { publishedAt: "2007-03-27" },
      },
    });

    const call = editionUpdateMock.mock.calls[0] as [{ data: { publishedAt: Date } }];
    expect(call[0].data.publishedAt).toBeInstanceOf(Date);
  });

  it("sets publishedAt to null when null is passed", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    await updateEditionServerFn({
      data: {
        editionId: "e1",
        fields: { publishedAt: null },
      },
    });

    const call = editionUpdateMock.mock.calls[0] as [{ data: { publishedAt: null } }];
    expect(call[0].data.publishedAt).toBeNull();
  });

  it("handles edition not found for editedFields gracefully", async () => {
    editionFindUniqueMock.mockResolvedValue(null);
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    await updateEditionServerFn({
      data: {
        editionId: "e1",
        fields: { publisher: "DAW" },
      },
    });

    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        publisher: "DAW",
        editedFields: ["publisher"],
      },
    });
  });

  it("handles null values for optional fields", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    await updateEditionServerFn({
      data: {
        editionId: "e1",
        fields: { isbn13: null, publisher: null },
      },
    });

    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        isbn13: null,
        publisher: null,
        editedFields: ["isbn13", "publisher"],
      },
    });
  });

  it("merges editedFields with existing values", async () => {
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: ["isbn13"] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });

    await updateEditionServerFn({
      data: {
        editionId: "e1",
        fields: { publisher: "DAW Books" },
      },
    });

    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        publisher: "DAW Books",
        editedFields: ["isbn13", "publisher"],
      },
    });
  });
});

describe("updateWorkAuthorsServerFn", () => {
  it("updates authors across all editions of a work", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    canonicalizeContributorNameMock.mockReturnValue("patrick rothfuss");
    contributorFindFirstMock.mockResolvedValue({ id: "c1" });
    transactionMock.mockImplementation(async (fn: () => Promise<object>) => fn());
    editionContributorDeleteManyMock.mockResolvedValue({ count: 2 });
    editionContributorCreateManyMock.mockResolvedValue({ count: 2 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await updateWorkAuthorsServerFn({
      data: {
        workId: "w1",
        authors: ["Patrick Rothfuss"],
      },
    });

    expect(editionFindManyMock).toHaveBeenCalledWith({
      where: { workId: "w1" },
      select: { id: true },
    });
    expect(canonicalizeContributorNameMock).toHaveBeenCalledWith("Patrick Rothfuss");
    expect(contributorFindFirstMock).toHaveBeenCalledWith({
      where: { nameCanonical: "patrick rothfuss" },
    });
    expect(editionContributorDeleteManyMock).toHaveBeenCalledWith({
      where: {
        editionId: { in: ["e1", "e2"] },
        role: "AUTHOR",
      },
    });
    expect(editionContributorCreateManyMock).toHaveBeenCalledWith({
      data: [
        { editionId: "e1", contributorId: "c1", role: "AUTHOR" },
        { editionId: "e2", contributorId: "c1", role: "AUTHOR" },
      ],
      skipDuplicates: true,
    });
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { editedFields: ["authors"] },
    });
    expect(result).toEqual({ success: true });
  });

  it("creates new contributor when not found by canonical name", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
    canonicalizeContributorNameMock.mockReturnValue("new author");
    contributorFindFirstMock.mockResolvedValue(null);
    contributorCreateMock.mockResolvedValue({ id: "c-new" });
    transactionMock.mockImplementation(async (fn: () => Promise<object>) => fn());
    editionContributorDeleteManyMock.mockResolvedValue({ count: 0 });
    editionContributorCreateManyMock.mockResolvedValue({ count: 1 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkAuthorsServerFn({
      data: {
        workId: "w1",
        authors: ["New Author"],
      },
    });

    expect(contributorCreateMock).toHaveBeenCalledWith({
      data: {
        nameDisplay: "New Author",
        nameCanonical: "new author",
      },
    });
    expect(editionContributorCreateManyMock).toHaveBeenCalledWith({
      data: [{ editionId: "e1", contributorId: "c-new", role: "AUTHOR" }],
      skipDuplicates: true,
    });
  });

  it("handles work not found for editedFields gracefully when updating authors", async () => {
    workFindUniqueMock.mockResolvedValue(null);
    editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
    canonicalizeContributorNameMock.mockReturnValue("author");
    contributorFindFirstMock.mockResolvedValue({ id: "c1" });
    transactionMock.mockImplementation(async (fn: () => Promise<object>) => fn());
    editionContributorDeleteManyMock.mockResolvedValue({ count: 0 });
    editionContributorCreateManyMock.mockResolvedValue({ count: 1 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkAuthorsServerFn({
      data: {
        workId: "w1",
        authors: ["Author"],
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { editedFields: ["authors"] },
    });
  });

  it("falls back to lowercase when canonicalize returns undefined", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
    canonicalizeContributorNameMock.mockReturnValue(undefined);
    contributorFindFirstMock.mockResolvedValue(null);
    contributorCreateMock.mockResolvedValue({ id: "c-new" });
    transactionMock.mockImplementation(async (fn: () => Promise<object>) => fn());
    editionContributorDeleteManyMock.mockResolvedValue({ count: 0 });
    editionContributorCreateManyMock.mockResolvedValue({ count: 1 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkAuthorsServerFn({
      data: { workId: "w1", authors: ["Some Author"] },
    });

    expect(contributorFindFirstMock).toHaveBeenCalledWith({
      where: { nameCanonical: "some author" },
    });
  });

  it("throws when authors array is empty", async () => {
    await expect(
      updateWorkAuthorsServerFn({
        data: {
          workId: "w1",
          authors: [],
        },
      }),
    ).rejects.toThrow("At least one author is required");
  });
});

describe("getContributorNamesServerFn", () => {
  it("returns sorted contributor names", async () => {
    contributorFindManyMock.mockResolvedValue([
      { nameDisplay: "Brandon Sanderson" },
      { nameDisplay: "Patrick Rothfuss" },
    ]);

    const result = await getContributorNamesServerFn();

    expect(contributorFindManyMock).toHaveBeenCalledWith({
      where: { editions: { some: {} } },
      select: { nameDisplay: true },
      orderBy: { nameDisplay: "asc" },
    });
    expect(result).toEqual(["Brandon Sanderson", "Patrick Rothfuss"]);
  });
});

