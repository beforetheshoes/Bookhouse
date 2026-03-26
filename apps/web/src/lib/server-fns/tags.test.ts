import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: (schema: unknown) => Builder;
      handler: (fn: (a: Record<string, unknown>) => unknown) => (a: Record<string, unknown>) => unknown;
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
const tagFindFirstMock = vi.fn();
const tagCreateMock = vi.fn();
const tagFindManyMock = vi.fn();
const workTagDeleteManyMock = vi.fn();
const workTagCreateManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: {
      findUnique: workFindUniqueMock,
      update: workUpdateMock,
    },
    tag: {
      findFirst: tagFindFirstMock,
      create: tagCreateMock,
      findMany: tagFindManyMock,
    },
    workTag: {
      deleteMany: workTagDeleteManyMock,
      createMany: workTagCreateManyMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  updateWorkTagsServerFn,
  getTagSuggestionsServerFn,
} from "./tags";

beforeEach(() => {
  workFindUniqueMock.mockReset();
  workUpdateMock.mockReset();
  tagFindFirstMock.mockReset();
  tagCreateMock.mockReset();
  tagFindManyMock.mockReset();
  workTagDeleteManyMock.mockReset();
  workTagCreateManyMock.mockReset();
  transactionMock.mockReset();
});

describe("updateWorkTagsServerFn", () => {
  it("creates tags and associates them with the work", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    tagFindFirstMock.mockResolvedValue(null);
    tagCreateMock.mockResolvedValueOnce({ id: "t1" }).mockResolvedValueOnce({ id: "t2" });
    transactionMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    workTagDeleteManyMock.mockResolvedValue({ count: 0 });
    workTagCreateManyMock.mockResolvedValue({ count: 2 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await updateWorkTagsServerFn({
      data: { workId: "w1", tags: ["Fiction", "Sci-Fi"] },
    });

    expect(tagCreateMock).toHaveBeenCalledTimes(2);
    expect(tagCreateMock).toHaveBeenCalledWith({
      data: { name: "Fiction", nameCanonical: "fiction" },
    });
    expect(tagCreateMock).toHaveBeenCalledWith({
      data: { name: "Sci-Fi", nameCanonical: "sci-fi" },
    });
    expect(workTagDeleteManyMock).toHaveBeenCalledWith({
      where: { workId: "w1" },
    });
    expect(workTagCreateManyMock).toHaveBeenCalledWith({
      data: [
        { workId: "w1", tagId: "t1" },
        { workId: "w1", tagId: "t2" },
      ],
      skipDuplicates: true,
    });
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { editedFields: ["tags"] },
    });
    expect(result).toEqual({ success: true });
  });

  it("reuses existing tags by canonical name", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    tagFindFirstMock.mockResolvedValue({ id: "existing-t1" });
    transactionMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    workTagDeleteManyMock.mockResolvedValue({ count: 0 });
    workTagCreateManyMock.mockResolvedValue({ count: 1 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkTagsServerFn({
      data: { workId: "w1", tags: ["Fiction"] },
    });

    expect(tagCreateMock).not.toHaveBeenCalled();
    expect(workTagCreateManyMock).toHaveBeenCalledWith({
      data: [{ workId: "w1", tagId: "existing-t1" }],
      skipDuplicates: true,
    });
  });

  it("skips blank tag names", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    tagFindFirstMock.mockResolvedValue(null);
    tagCreateMock.mockResolvedValue({ id: "t1" });
    transactionMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    workTagDeleteManyMock.mockResolvedValue({ count: 0 });
    workTagCreateManyMock.mockResolvedValue({ count: 1 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkTagsServerFn({
      data: { workId: "w1", tags: ["Fiction", "", "  "] },
    });

    expect(tagCreateMock).toHaveBeenCalledTimes(1);
    expect(tagCreateMock).toHaveBeenCalledWith({
      data: { name: "Fiction", nameCanonical: "fiction" },
    });
  });

  it("clears all tags when empty array is passed", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    transactionMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    workTagDeleteManyMock.mockResolvedValue({ count: 2 });
    workTagCreateManyMock.mockResolvedValue({ count: 0 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    const result = await updateWorkTagsServerFn({
      data: { workId: "w1", tags: [] },
    });

    expect(workTagDeleteManyMock).toHaveBeenCalledWith({ where: { workId: "w1" } });
    expect(workTagCreateManyMock).toHaveBeenCalledWith({
      data: [],
      skipDuplicates: true,
    });
    expect(result).toEqual({ success: true });
  });

  it("merges editedFields with existing values", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description"] });
    transactionMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    workTagDeleteManyMock.mockResolvedValue({ count: 0 });
    workTagCreateManyMock.mockResolvedValue({ count: 0 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkTagsServerFn({
      data: { workId: "w1", tags: [] },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { editedFields: ["description", "tags"] },
    });
  });

  it("handles work not found for editedFields gracefully", async () => {
    workFindUniqueMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    workTagDeleteManyMock.mockResolvedValue({ count: 0 });
    workTagCreateManyMock.mockResolvedValue({ count: 0 });
    workUpdateMock.mockResolvedValue({ id: "w1" });

    await updateWorkTagsServerFn({
      data: { workId: "w1", tags: [] },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { editedFields: ["tags"] },
    });
  });
});

describe("getTagSuggestionsServerFn", () => {
  it("returns matching tags", async () => {
    tagFindManyMock.mockResolvedValue([
      { id: "t1", name: "Fiction" },
      { id: "t2", name: "Historical Fiction" },
    ]);

    const result = await getTagSuggestionsServerFn({
      data: { query: "fic" },
    });

    expect(tagFindManyMock).toHaveBeenCalledWith({
      where: { nameCanonical: { contains: "fic" } },
      take: 20,
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([
      { id: "t1", name: "Fiction" },
      { id: "t2", name: "Historical Fiction" },
    ]);
  });

  it("returns empty array for empty query", async () => {
    tagFindManyMock.mockResolvedValue([]);

    const result = await getTagSuggestionsServerFn({
      data: { query: "" },
    });

    expect(result).toEqual([]);
  });
});
