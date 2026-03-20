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
const countMock = vi.fn();
const editionGroupByMock = vi.fn();
const seriesCountMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findMany: findManyMock, count: countMock },
    edition: { groupBy: editionGroupByMock },
    series: { count: seriesCountMock },
  },
}));

import {
  getLibraryWorksServerFn,
  getFilteredLibraryWorksServerFn,
} from "./library";

describe("getLibraryWorksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.work.findMany with correct include options", async () => {
    findManyMock.mockResolvedValue([]);
    await getLibraryWorksServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      include: {
        series: true,
        editions: {
          include: {
            contributors: {
              include: { contributor: true },
            },
          },
        },
      },
    });
  });

  it("returns what findMany returns", async () => {
    const fakeData = [{ id: "1", title: "Test Work" }];
    findManyMock.mockResolvedValue(fakeData);
    const result = await getLibraryWorksServerFn();
    expect(result).toBe(fakeData);
  });
});

describe("getFilteredLibraryWorksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    countMock.mockReset();
    editionGroupByMock.mockReset();
    seriesCountMock.mockReset();
  });

  it("returns paginated works with defaults (page 1, pageSize 50)", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
        orderBy: { titleCanonical: "asc" },
      }),
    );
    expect(countMock).toHaveBeenCalled();
    expect(result).toEqual({
      works: [],
      totalCount: 0,
      facetCounts: {
        format: [],
        hasCover: { withCover: 0, withoutCover: 0 },
        series: 0,
      },
    });
  });

  it("applies page and pageSize to skip/take", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(100);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { page: 3, pageSize: 20 },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 20,
      }),
    );
  });

  it("sorts by title-desc", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { sort: "title-desc" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { titleCanonical: "desc" },
      }),
    );
  });

  it("sorts by recent", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { sort: "recent" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("filters by format family", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          editions: { some: { formatFamily: { in: ["EBOOK"] } } },
        }) as unknown,
      }),
    );
  });

  it("filters by author ID", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { authorId: ["author-1"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          editions: {
            some: {
              contributors: {
                some: {
                  contributorId: { in: ["author-1"] },
                  role: "AUTHOR",
                },
              },
            },
          },
        }) as unknown,
      }),
    );
  });

  it("filters by series ID", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { seriesId: ["series-1"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: { in: ["series-1"] },
        }) as unknown,
      }),
    );
  });

  it("filters by publisher", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { publisher: ["Penguin"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          editions: { some: { publisher: { in: ["Penguin"] } } },
        }) as unknown,
      }),
    );
  });

  it("filters by hasCover true", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { hasCover: true },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coverPath: { not: null },
        }) as unknown,
      }),
    );
  });

  it("filters by hasCover false", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { hasCover: false },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coverPath: null,
        }) as unknown,
      }),
    );
  });

  it("filters by text query (q) on titleDisplay and titleCanonical", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { q: "hobbit" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { titleDisplay: { contains: "hobbit", mode: "insensitive" } },
            { titleCanonical: { contains: "hobbit", mode: "insensitive" } },
          ],
        }) as unknown,
      }),
    );
  });

  it("combines multiple filters with AND logic", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: {
        format: ["EBOOK"],
        hasCover: true,
        q: "test",
      },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
    expect(call.where).toEqual(
      expect.objectContaining({
        editions: { some: { formatFamily: { in: ["EBOOK"] } } },
        coverPath: { not: null },
        OR: [
          { titleDisplay: { contains: "test", mode: "insensitive" } },
          { titleCanonical: { contains: "test", mode: "insensitive" } },
        ],
      }),
    );
  });

  it("passes the same where clause to count as to findMany", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(5);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { format: ["AUDIOBOOK"] },
    });

    const findManyWhere = ((findManyMock.mock.calls[0] as unknown[])[0] as { where: unknown }).where;
    expect(countMock).toHaveBeenCalledWith({ where: findManyWhere });
  });

  it("returns facet counts for format families", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([
      { formatFamily: "EBOOK", _count: { _all: 10 } },
      { formatFamily: "AUDIOBOOK", _count: { _all: 3 } },
    ]);
    seriesCountMock.mockResolvedValue(2);

    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.format).toEqual([
      { formatFamily: "EBOOK", _count: { _all: 10 } },
      { formatFamily: "AUDIOBOOK", _count: { _all: 3 } },
    ]);
  });

  it("returns facet counts for hasCover", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(10);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    // countMock is called twice: once for totalCount, once for withCover
    // We need to be specific about which calls return what
    countMock
      .mockResolvedValueOnce(10)  // totalCount
      .mockResolvedValueOnce(7);  // withCover

    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.hasCover).toEqual({
      withCover: 7,
      withoutCover: 3,
    });
  });

  it("returns series count in facet counts", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(5);

    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.series).toBe(5);
  });

  it("includes standard includes in findMany", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    seriesCountMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({ data: {} });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          series: true,
          editions: {
            include: {
              contributors: {
                include: { contributor: true },
              },
            },
          },
        },
      }),
    );
  });
});
