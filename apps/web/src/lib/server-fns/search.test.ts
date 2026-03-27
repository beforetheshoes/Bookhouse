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

const workFindManyMock = vi.fn();
const contributorFindManyMock = vi.fn();
const seriesFindManyMock = vi.fn();
const editionFindManyMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findMany: workFindManyMock },
    contributor: { findMany: contributorFindManyMock },
    series: { findMany: seriesFindManyMock },
    edition: { findMany: editionFindManyMock },
  },
}));

import { searchLibraryServerFn } from "./search";

describe("searchLibraryServerFn", () => {
  beforeEach(() => {
    workFindManyMock.mockReset();
    contributorFindManyMock.mockReset();
    seriesFindManyMock.mockReset();
    editionFindManyMock.mockReset();
  });

  it("returns empty groups for empty query", async () => {
    const result = await searchLibraryServerFn({ data: { query: "" } });
    expect(result).toEqual({ works: [], authors: [], series: [] });
    expect(workFindManyMock).not.toHaveBeenCalled();
    expect(contributorFindManyMock).not.toHaveBeenCalled();
    expect(seriesFindManyMock).not.toHaveBeenCalled();
    expect(editionFindManyMock).not.toHaveBeenCalled();
  });

  it("returns empty groups for whitespace-only query", async () => {
    const result = await searchLibraryServerFn({ data: { query: "   " } });
    expect(result).toEqual({ works: [], authors: [], series: [] });
    expect(workFindManyMock).not.toHaveBeenCalled();
  });

  it("searches works by titleDisplay and titleCanonical", async () => {
    const fakeWorks = [{ id: "w1", titleDisplay: "The Hobbit" }];
    workFindManyMock.mockResolvedValue(fakeWorks);
    contributorFindManyMock.mockResolvedValue([]);
    seriesFindManyMock.mockResolvedValue([]);
    editionFindManyMock.mockResolvedValue([]);

    const result = await searchLibraryServerFn({ data: { query: "hobbit" } });

    expect(workFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { titleDisplay: { contains: "hobbit", mode: "insensitive" } },
            { titleCanonical: { contains: "hobbit", mode: "insensitive" } },
          ],
        },
        take: 5,
      }),
    );
    expect(result.works).toEqual(fakeWorks);
  });

  it("includes series and editions in work results", async () => {
    workFindManyMock.mockResolvedValue([]);
    contributorFindManyMock.mockResolvedValue([]);
    seriesFindManyMock.mockResolvedValue([]);
    editionFindManyMock.mockResolvedValue([]);

    await searchLibraryServerFn({ data: { query: "test" } });

    expect(workFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          series: true,
          editions: {
            include: {
              contributors: { include: { contributor: true } },
            },
          },
        },
      }),
    );
  });

  it("searches contributors by nameDisplay", async () => {
    const fakeAuthors = [{ id: "c1", nameDisplay: "Tolkien" }];
    workFindManyMock.mockResolvedValue([]);
    contributorFindManyMock.mockResolvedValue(fakeAuthors);
    seriesFindManyMock.mockResolvedValue([]);
    editionFindManyMock.mockResolvedValue([]);

    const result = await searchLibraryServerFn({ data: { query: "tolkien" } });

    expect(contributorFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          nameDisplay: { contains: "tolkien", mode: "insensitive" },
        },
        take: 5,
      }),
    );
    expect(result.authors).toEqual(fakeAuthors);
  });

  it("searches series by name", async () => {
    const fakeSeries = [{ id: "s1", name: "Lord of the Rings" }];
    workFindManyMock.mockResolvedValue([]);
    contributorFindManyMock.mockResolvedValue([]);
    seriesFindManyMock.mockResolvedValue(fakeSeries);
    editionFindManyMock.mockResolvedValue([]);

    const result = await searchLibraryServerFn({ data: { query: "lord" } });

    expect(seriesFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: { contains: "lord", mode: "insensitive" },
        },
        take: 5,
      }),
    );
    expect(result.series).toEqual(fakeSeries);
  });

  it("searches editions by ISBN and ASIN and returns associated works", async () => {
    const fakeEditions = [
      { id: "e1", work: { id: "w1", titleDisplay: "Test" } },
      { id: "e2", work: { id: "w2", titleDisplay: "Other" } },
    ];
    workFindManyMock.mockResolvedValue([]);
    contributorFindManyMock.mockResolvedValue([]);
    seriesFindManyMock.mockResolvedValue([]);
    editionFindManyMock.mockResolvedValue(fakeEditions);

    const result = await searchLibraryServerFn({ data: { query: "978" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { isbn13: { contains: "978", mode: "insensitive" } },
            { isbn10: { contains: "978", mode: "insensitive" } },
            { asin: { contains: "978", mode: "insensitive" } },
          ],
        },
        take: 5,
        include: {
          work: {
            include: {
              series: true,
              editions: {
                include: {
                  contributors: { include: { contributor: true } },
                },
              },
            },
          },
        },
      }),
    );
    // Works from edition search are merged into the works group
    expect(result.works).toEqual([
      { id: "w1", titleDisplay: "Test" },
      { id: "w2", titleDisplay: "Other" },
    ]);
  });

  it("deduplicates works from title and ISBN searches", async () => {
    const titleWork = { id: "w1", titleDisplay: "Test" };
    const isbnEdition = { id: "e1", work: { id: "w1", titleDisplay: "Test" } };
    workFindManyMock.mockResolvedValue([titleWork]);
    contributorFindManyMock.mockResolvedValue([]);
    seriesFindManyMock.mockResolvedValue([]);
    editionFindManyMock.mockResolvedValue([isbnEdition]);

    const result = await searchLibraryServerFn({ data: { query: "test" } });

    // Should not have duplicates
    const workIds = result.works.map((w: { id: string }) => w.id);
    expect(workIds).toEqual(["w1"]);
  });
});
