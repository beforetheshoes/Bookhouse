import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Builder = {
      inputValidator: () => Builder;
      handler: <T extends Record<string, string | number | boolean | null | string[] | Date | undefined>>(fn: (a: T) => T | Promise<T>) => (a: T) => T | Promise<T>;
    };
    const b: Builder = {
      inputValidator: () => b,
      handler: (fn) => (a) => fn(a),
    };
    return b;
  },
}));

const contributorFindManyMock = vi.fn();
const contributorFindUniqueOrThrowMock = vi.fn();
const workFindManyMock = vi.fn();
vi.mock("@bookhouse/db", () => ({
  db: {
    contributor: {
      findMany: contributorFindManyMock,
      findUniqueOrThrow: contributorFindUniqueOrThrowMock,
    },
    work: {
      findMany: workFindManyMock,
    },
  },
}));

import {
  getAuthorsListServerFn,
  getAuthorDetailServerFn,
} from "./authors";

describe("getAuthorsListServerFn", () => {
  beforeEach(() => {
    contributorFindManyMock.mockReset();
  });

  it("calls db.contributor.findMany with correct args and computes workCount", async () => {
    contributorFindManyMock.mockResolvedValue([
      {
        id: "c1",
        nameDisplay: "Author One",
        editions: [
          { edition: { workId: "w1" } },
          { edition: { workId: "w1" } },
          { edition: { workId: "w2" } },
        ],
      },
    ]);
    const result = await getAuthorsListServerFn();
    expect(contributorFindManyMock).toHaveBeenCalledWith({
      where: {
        editions: { some: { role: "AUTHOR" } },
      },
      include: {
        editions: {
          where: { role: "AUTHOR" },
          include: { edition: { select: { workId: true } } },
        },
      },
      orderBy: { nameDisplay: "asc" },
    });
    expect(result).toEqual([
      { id: "c1", nameDisplay: "Author One", workCount: 2 },
    ]);
  });

  it("returns empty array when no authors", async () => {
    contributorFindManyMock.mockResolvedValue([]);
    const result = await getAuthorsListServerFn();
    expect(result).toEqual([]);
  });
});

describe("getAuthorDetailServerFn", () => {
  beforeEach(() => {
    contributorFindUniqueOrThrowMock.mockReset();
    workFindManyMock.mockReset();
  });

  it("fetches contributor then works and returns combined result", async () => {
    contributorFindUniqueOrThrowMock.mockResolvedValue({
      id: "c1",
      nameDisplay: "Author One",
      nameCanonical: "author one",
      editions: [
        { edition: { workId: "w1" } },
        { edition: { workId: "w2" } },
        { edition: { workId: "w1" } },
      ],
    });
    const fakeWorks = [
      { id: "w1", titleDisplay: "Book One" },
      { id: "w2", titleDisplay: "Book Two" },
    ];
    workFindManyMock.mockResolvedValue(fakeWorks);

    const result = await getAuthorDetailServerFn({
      data: { authorId: "c1" },
    });

    expect(contributorFindUniqueOrThrowMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      select: {
        id: true,
        nameDisplay: true,
        nameCanonical: true,
        editions: {
          where: { role: "AUTHOR" },
          select: { edition: { select: { workId: true } } },
        },
      },
    });
    expect(workFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["w1", "w2"] } },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
          },
        },
      },
    });
    expect(result).toEqual({
      id: "c1",
      nameDisplay: "Author One",
      nameCanonical: "author one",
      works: fakeWorks,
    });
  });

  it("propagates error when author not found", async () => {
    contributorFindUniqueOrThrowMock.mockRejectedValue(new Error("Not found"));

    await expect(
      getAuthorDetailServerFn({ data: { authorId: "nonexistent" } }),
    ).rejects.toThrow("Not found");
  });

  it("returns empty works array when author has no editions", async () => {
    contributorFindUniqueOrThrowMock.mockResolvedValue({
      id: "c1",
      nameDisplay: "Lonely Author",
      nameCanonical: "lonely author",
      editions: [],
    });
    workFindManyMock.mockResolvedValue([]);

    const result = await getAuthorDetailServerFn({
      data: { authorId: "c1" },
    });

    expect(workFindManyMock).toHaveBeenCalledWith({
      where: { id: { in: [] } },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
          },
        },
      },
    });
    expect(result.works).toEqual([]);
  });
});
