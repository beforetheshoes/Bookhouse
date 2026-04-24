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

const findManyMock = vi.fn();
const countMock = vi.fn();
const editionGroupByMock = vi.fn();
const editionFindManyMock = vi.fn();
const editionCountMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findMany: findManyMock, count: countMock },
    edition: { groupBy: editionGroupByMock, findMany: editionFindManyMock, count: editionCountMock },
  },
}));

import {
  getLibraryWorksServerFn,
  getFilteredLibraryWorksServerFn,
  getAllFilteredWorkIdsServerFn,
  getFilteredLibraryEditionsServerFn,
} from "./library";

describe("getLibraryWorksServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("calls db.work.findMany with correct include and availability filter", async () => {
    findManyMock.mockResolvedValue([]);
    await getLibraryWorksServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        editions: {
          some: {
            editionFiles: {
              some: {
                fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } },
              },
            },
          },
        },
      },
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
  });

  it("returns paginated works with defaults (page 1, pageSize 50)", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
        orderBy: { sortTitle: { sort: "asc", nulls: "last" } },
      }),
    );
    expect(countMock).toHaveBeenCalled();
    const expectedFacetCounts = {
      format: [
        { formatFamily: "EBOOK", _count: { _all: 0 } },
        { formatFamily: "AUDIOBOOK", _count: { _all: 0 } },
      ],
      hasCover: { withCover: 0, withoutCover: 0 },
      enrichment: { enriched: 0, unenriched: 0 },
      description: { withDescription: 0, withoutDescription: 0 },
      series: { inSeries: 0, standalone: 0 },
    };
    expect(result).toEqual({
      works: [],
      totalCount: 0,
      facetCounts: expectedFacetCounts,
      totalFacetCounts: expectedFacetCounts,
    });
  });

  it("applies page and pageSize to skip/take", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(100);
    editionGroupByMock.mockResolvedValue([]);
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
    await getFilteredLibraryWorksServerFn({
      data: { sort: "title-desc" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { sortTitle: { sort: "desc", nulls: "last" } },
      }),
    );
  });

  it("sorts by recent", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { sort: "recent" },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("sorts by format-asc using two-step approach", async () => {
    const lightweightWorks = [
      { id: "w-e", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-a", editions: [{ publisher: null, formatFamily: "AUDIOBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-none", editions: [] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-a" }, { id: "w-e" }, { id: "w-none" }]);
    countMock.mockResolvedValue(3);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "format-asc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["w-a", "w-e", "w-none"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-a", "w-e", "w-none"]);
  });

  it("sorts by format-desc using two-step approach", async () => {
    const lightweightWorks = [
      { id: "w-a", editions: [{ publisher: null, formatFamily: "AUDIOBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-e", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-e" }, { id: "w-a" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "format-desc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["w-e", "w-a"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-e", "w-a"]);
  });

  it("sorts by author-asc using two-step approach with select", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "author-asc" },
    });
    // First call uses select (lightweight) to get IDs + author names
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true }) as object,
      }),
    );
    expect(result.works).toEqual([]);
  });

  it("sorts by author-desc using two-step approach with select", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "author-desc" },
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true }) as object,
      }),
    );
    expect(result.works).toEqual([]);
  });

  it("author sort fetches full works by ID after sorting", async () => {
    const lightweightWorks = [
      { id: "w-b", editions: [{ contributors: [{ contributor: { nameCanonical: "bravo" } }] }] },
      { id: "w-a", editions: [{ contributors: [{ contributor: { nameCanonical: "alpha" } }] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks) // first call: lightweight
      .mockResolvedValueOnce([{ id: "w-a" }, { id: "w-b" }]); // second call: full works by ID
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "author-asc" },
    });
    // Second findMany call should fetch by IDs in sorted order
    expect(findManyMock).toHaveBeenCalledTimes(2);
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["w-a", "w-b"]);
    // Results should be in author-asc order
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-a", "w-b"]);
  });

  it("author-desc reverses sort order", async () => {
    const lightweightWorks = [
      { id: "w-a", editions: [{ contributors: [{ contributor: { nameCanonical: "alpha" } }] }] },
      { id: "w-b", editions: [{ contributors: [{ contributor: { nameCanonical: "bravo" } }] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-b" }, { id: "w-a" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "author-desc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["w-b", "w-a"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-b", "w-a"]);
  });

  it("author sort puts works without authors last when ascending", async () => {
    const lightweightWorks = [
      { id: "w-none", editions: [{ contributors: [] }] },
      { id: "w-a", editions: [{ contributors: [{ contributor: { nameCanonical: "alpha" } }] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-a" }, { id: "w-none" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "author-asc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    // alpha comes first, no-author goes to end
    expect(secondCall.where.id.in).toEqual(["w-a", "w-none"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-a", "w-none"]);
  });

  it("filters by format family", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          editions: { some: { formatFamily: { in: ["EBOOK"] } } },
        }) as object,
      }),
    );
  });

  it("filters by author ID", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
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
        }) as object,
      }),
    );
  });

  it("filters by series ID", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { seriesId: ["series-1"] },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: { in: ["series-1"] },
        }) as object,
      }),
    );
  });

  it("filters by hasCover true", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { hasCover: true },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coverPath: { not: null },
        }) as object,
      }),
    );
  });

  it("filters by hasCover false", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { hasCover: false },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coverPath: null,
        }) as object,
      }),
    );
  });

  it("filters by text query (q) on titleDisplay and titleCanonical", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
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
        }) as object,
      }),
    );
  });

  it("combines format + authorId into a single editions filter with AND", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"], authorId: ["author-1"] },
    });

    const call = findManyMock.mock.calls[0]?.[0] as { where: Record<string, object | string | boolean | null> };
    expect(call.where).toEqual(
      expect.objectContaining({
        editions: {
          some: {
            AND: [
              { formatFamily: { in: ["EBOOK"] } },
              {
                contributors: {
                  some: { contributorId: { in: ["author-1"] }, role: "AUTHOR" },
                },
              },
            ],
          },
        },
      }),
    );
  });

  it("combines edition-level and work-level filters with AND logic", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: {
        format: ["EBOOK"],
        authorId: ["author-1"],
        hasCover: true,
        q: "test",
      },
    });

    const call = findManyMock.mock.calls[0]?.[0] as { where: Record<string, object | string | boolean | null> };
    expect(call.where).toEqual(
      expect.objectContaining({
        editions: {
          some: {
            AND: [
              { formatFamily: { in: ["EBOOK"] } },
              {
                contributors: {
                  some: { contributorId: { in: ["author-1"] }, role: "AUTHOR" },
                },
              },
            ],
          },
        },
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
    await getFilteredLibraryWorksServerFn({
      data: { format: ["AUDIOBOOK"] },
    });

    const findManyWhere = (findManyMock.mock.calls[0]?.[0] as { where: object }).where;
    expect(countMock).toHaveBeenCalledWith({ where: findManyWhere });
  });

  it("returns facet counts for format families", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([
      { formatFamily: "EBOOK", _count: { _all: 10 } },
      { formatFamily: "AUDIOBOOK", _count: { _all: 3 } },
    ]);
    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.format).toEqual([
      { formatFamily: "EBOOK", _count: { _all: 10 } },
      { formatFamily: "AUDIOBOOK", _count: { _all: 3 } },
    ]);
  });

  it("fills in missing format families with zero counts", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    // groupBy only returns AUDIOBOOK — EBOOK is missing
    editionGroupByMock.mockResolvedValue([
      { formatFamily: "AUDIOBOOK", _count: { _all: 5 } },
    ]);
    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.format).toEqual([
      { formatFamily: "EBOOK", _count: { _all: 0 } },
      { formatFamily: "AUDIOBOOK", _count: { _all: 5 } },
    ]);
  });

  it("returns format families in stable EBOOK, AUDIOBOOK order", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    // groupBy returns AUDIOBOOK first
    editionGroupByMock.mockResolvedValue([
      { formatFamily: "AUDIOBOOK", _count: { _all: 3 } },
      { formatFamily: "EBOOK", _count: { _all: 10 } },
    ]);
    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.format).toEqual([
      { formatFamily: "EBOOK", _count: { _all: 10 } },
      { formatFamily: "AUDIOBOOK", _count: { _all: 3 } },
    ]);
  });

  it("returns facet counts for hasCover", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    // Default for all count calls, then override specific ones
    countMock.mockResolvedValue(0);
    countMock
      .mockResolvedValueOnce(10)  // totalCount
      .mockResolvedValueOnce(7)   // withCover
      .mockResolvedValueOnce(3);  // withoutCover

    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.hasCover).toEqual({
      withCover: 7,
      withoutCover: 3,
    });
  });

  it("returns correct hasCover facet counts when hasCover filter is active", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    // Default for remaining count calls, then override specific ones
    countMock.mockResolvedValue(0);
    countMock
      .mockResolvedValueOnce(343)  // totalCount (filtered by hasCover=false)
      .mockResolvedValueOnce(347)  // withCoverCount
      .mockResolvedValueOnce(343); // withoutCoverCount

    const result = await getFilteredLibraryWorksServerFn({ data: { hasCover: false } });

    // Facet counts must not go negative
    expect(result.facetCounts.hasCover.withCover).toBe(347);
    expect(result.facetCounts.hasCover.withoutCover).toBe(343);
    expect(result.facetCounts.hasCover.withoutCover).toBeGreaterThanOrEqual(0);
  });

  it("scopes cover facet counts to full active filter set", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    countMock.mockResolvedValue(5);

    await getFilteredLibraryWorksServerFn({ data: { q: "wind" } });

    // Cover count queries use AND to combine with full filter set
    const findManyWhere = (findManyMock.mock.calls[0]?.[0] as { where: object }).where;
    expect(countMock).toHaveBeenNthCalledWith(2, {
      where: { AND: [findManyWhere, { coverPath: { not: null } }] },
    });
    expect(countMock).toHaveBeenNthCalledWith(3, {
      where: { AND: [findManyWhere, { coverPath: null }] },
    });
  });

  it("format facet counts include active format filter", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({ data: { format: ["EBOOK"] } });

    // Format facet groupBy should include the format filter in the work where clause
    const findManyWhere = (findManyMock.mock.calls[0]?.[0] as { where: object }).where;
    expect(editionGroupByMock).toHaveBeenNthCalledWith(1, {
      by: ["formatFamily"],
      _count: { _all: true },
      where: { work: findManyWhere },
    });
    // Verify that the where clause actually contains the format filter
    expect(findManyWhere).toEqual(
      expect.objectContaining({
        editions: { some: { formatFamily: { in: ["EBOOK"] } } },
      }),
    );
  });

  it("cover facet counts include both hasCover and format filters", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    countMock.mockResolvedValue(5);

    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"], hasCover: false },
    });

    // Cover count queries use AND to properly intersect with active filters
    const findManyWhere = (findManyMock.mock.calls[0]?.[0] as { where: object }).where;
    expect(countMock).toHaveBeenNthCalledWith(2, {
      where: { AND: [findManyWhere, { coverPath: { not: null } }] },
    });
    expect(countMock).toHaveBeenNthCalledWith(3, {
      where: { AND: [findManyWhere, { coverPath: null }] },
    });
  });

  it("returns series facet counts from work.count", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    // 9 countMock calls: totalCount, withCover, withoutCover,
    // enriched, unenriched, withDescription, withoutDescription,
    // inSeries, standalone
    countMock
      .mockResolvedValueOnce(0)   // totalCount
      .mockResolvedValueOnce(0)   // withCover
      .mockResolvedValueOnce(0)   // withoutCover
      .mockResolvedValueOnce(0)   // enriched
      .mockResolvedValueOnce(0)   // unenriched
      .mockResolvedValueOnce(0)   // withDescription
      .mockResolvedValueOnce(0)   // withoutDescription
      .mockResolvedValueOnce(5)   // inSeries
      .mockResolvedValueOnce(3);  // standalone

    const result = await getFilteredLibraryWorksServerFn({ data: {} });

    expect(result.facetCounts.series).toEqual({
      inSeries: 5,
      standalone: 3,
    });
  });

  it("always includes availability filter in where clause", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({ data: {} });

    const call = findManyMock.mock.calls[0]?.[0] as { where: Record<string, object | string | boolean | null> };
    expect(call.where).toEqual(
      expect.objectContaining({
        AND: [
          {
            editions: {
              some: {
                editionFiles: {
                  some: {
                    fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } },
                  },
                },
              },
            },
          },
        ],
      }),
    );
  });

  it("includes standard includes in findMany", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
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

  it("filters by enriched true", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { enriched: true },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrichmentStatus: "ENRICHED",
        }) as object,
      }),
    );
  });

  it("filters by enriched false", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { enriched: false },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrichmentStatus: "STUB",
        }) as object,
      }),
    );
  });

  it("filters by hasDescription true", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { hasDescription: true },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          description: { not: null },
        }) as object,
      }),
    );
  });

  it("filters by hasDescription false", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { hasDescription: false },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          description: null,
        }) as object,
      }),
    );
  });

  it("filters by inSeries true", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { inSeries: true },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: { not: null },
        }) as object,
      }),
    );
  });

  it("filters by inSeries false", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { inSeries: false },
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seriesId: null,
        }) as object,
      }),
    );
  });

  it("returns totalFacetCounts using base where (no user filters)", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock
      .mockResolvedValueOnce([]) // filtered format counts
      .mockResolvedValueOnce([   // unfiltered format counts
        { formatFamily: "EBOOK", _count: { _all: 10 } },
        { formatFamily: "AUDIOBOOK", _count: { _all: 5 } },
      ]);

    // 18 count calls: 9 filtered + 9 unfiltered
    countMock
      .mockResolvedValueOnce(3)   // totalCount (filtered)
      .mockResolvedValueOnce(2)   // withCover (filtered)
      .mockResolvedValueOnce(1)   // withoutCover (filtered)
      .mockResolvedValueOnce(1)   // enriched (filtered)
      .mockResolvedValueOnce(2)   // unenriched (filtered)
      .mockResolvedValueOnce(1)   // withDescription (filtered)
      .mockResolvedValueOnce(2)   // withoutDescription (filtered)
      .mockResolvedValueOnce(1)   // inSeries (filtered)
      .mockResolvedValueOnce(2)   // standalone (filtered)
      .mockResolvedValueOnce(12)  // withCover (unfiltered)
      .mockResolvedValueOnce(3)   // withoutCover (unfiltered)
      .mockResolvedValueOnce(8)   // enriched (unfiltered)
      .mockResolvedValueOnce(7)   // unenriched (unfiltered)
      .mockResolvedValueOnce(6)   // withDescription (unfiltered)
      .mockResolvedValueOnce(9)   // withoutDescription (unfiltered)
      .mockResolvedValueOnce(4)   // inSeries (unfiltered)
      .mockResolvedValueOnce(11); // standalone (unfiltered)

    const result = await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"] },
    });

    expect(result.totalFacetCounts).toEqual({
      format: [
        { formatFamily: "EBOOK", _count: { _all: 10 } },
        { formatFamily: "AUDIOBOOK", _count: { _all: 5 } },
      ],
      hasCover: { withCover: 12, withoutCover: 3 },
      enrichment: { enriched: 8, unenriched: 7 },
      description: { withDescription: 6, withoutDescription: 9 },
      series: { inSeries: 4, standalone: 11 },
    });
  });

  it("totalFacetCounts queries use only base availability where", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);

    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"], hasCover: true, enriched: false },
    });

    const baseWhere = {
      AND: [
        {
          editions: {
            some: {
              editionFiles: {
                some: {
                  fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } },
                },
              },
            },
          },
        },
      ],
    };

    // Second editionGroupByMock call is for totalFacetCounts
    expect(editionGroupByMock).toHaveBeenNthCalledWith(2, {
      by: ["formatFamily"],
      _count: { _all: true },
      where: { work: baseWhere },
    });

    // Unfiltered cover counts (calls 10 and 11 of countMock)
    expect(countMock).toHaveBeenNthCalledWith(10, {
      where: { AND: [baseWhere, { coverPath: { not: null } }] },
    });
    expect(countMock).toHaveBeenNthCalledWith(11, {
      where: { AND: [baseWhere, { coverPath: null }] },
    });
  });
});

describe("getAllFilteredWorkIdsServerFn", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("returns all work IDs matching filters", async () => {
    findManyMock.mockResolvedValue([{ id: "w1" }, { id: "w2" }, { id: "w3" }]);

    const result = await getAllFilteredWorkIdsServerFn({ data: {} });

    expect(result).toEqual(["w1", "w2", "w3"]);
    expect(findManyMock).toHaveBeenCalledWith({
      where: expect.any(Object) as object,
      select: { id: true },
    });
  });

  it("returns empty array when no works match", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await getAllFilteredWorkIdsServerFn({ data: {} });

    expect(result).toEqual([]);
  });

  it("passes filter params to buildWhere", async () => {
    findManyMock.mockResolvedValue([{ id: "w1" }]);

    await getAllFilteredWorkIdsServerFn({ data: { q: "test", enriched: false } });

    const call = findManyMock.mock.calls[0] as [{ where: Record<string, string> }];
    expect(call[0].where).toBeTruthy();
  });
});

describe("getFilteredLibraryEditionsServerFn", () => {
  beforeEach(() => {
    editionFindManyMock.mockReset();
    editionCountMock.mockReset();
  });

  it("returns paginated editions with defaults", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    const result = await getFilteredLibraryEditionsServerFn({ data: {} });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
        orderBy: { work: { sortTitle: { sort: "asc", nulls: "last" } } },
      }),
    );
    expect(result).toEqual({ editions: [], totalCount: 0 });
  });

  it("applies page and pageSize", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(100);
    await getFilteredLibraryEditionsServerFn({ data: { page: 3, pageSize: 20 } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 20 }),
    );
  });

  it("sorts by title-desc via nested work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "title-desc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { work: { sortTitle: { sort: "desc", nulls: "last" } } } }),
    );
  });

  it("sorts by publisher-asc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "publisher-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publisher: "asc" } }),
    );
  });

  it("sorts by publisher-desc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "publisher-desc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publisher: "desc" } }),
    );
  });

  it("sorts by publishDate-asc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "publishDate-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: "asc" } }),
    );
  });

  it("sorts by publishDate-desc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "publishDate-desc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: "desc" } }),
    );
  });

  it("sorts by pageCount-asc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "pageCount-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { pageCount: "asc" } }),
    );
  });

  it("sorts by duration-desc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "duration-desc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { duration: "desc" } }),
    );
  });

  it("sorts by format-asc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "format-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { formatFamily: "asc" } }),
    );
  });

  it("sorts by recent", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "recent" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("sorts by author-asc using two-step approach", async () => {
    const lightweightEditions = [
      { id: "e-b", contributors: [{ contributor: { nameCanonical: "bravo" } }] },
      { id: "e-a", contributors: [{ contributor: { nameCanonical: "alpha" } }] },
    ];
    editionFindManyMock
      .mockResolvedValueOnce(lightweightEditions)
      .mockResolvedValueOnce([{ id: "e-a" }, { id: "e-b" }]);
    editionCountMock.mockResolvedValue(2);
    const result = await getFilteredLibraryEditionsServerFn({ data: { sort: "author-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledTimes(2);
    const secondCall = (editionFindManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["e-a", "e-b"]);
    expect(result.editions.map((e: { id: string }) => e.id)).toEqual(["e-a", "e-b"]);
  });

  it("sorts by narrator-asc using two-step approach", async () => {
    const lightweightEditions = [
      { id: "e-b", contributors: [{ contributor: { nameCanonical: "zach" } }] },
      { id: "e-a", contributors: [{ contributor: { nameCanonical: "anna" } }] },
    ];
    editionFindManyMock
      .mockResolvedValueOnce(lightweightEditions)
      .mockResolvedValueOnce([{ id: "e-a" }, { id: "e-b" }]);
    editionCountMock.mockResolvedValue(2);
    const result = await getFilteredLibraryEditionsServerFn({ data: { sort: "narrator-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledTimes(2);
    const secondCall = (editionFindManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["e-a", "e-b"]);
    expect(result.editions.map((e: { id: string }) => e.id)).toEqual(["e-a", "e-b"]);
  });

  it("sorts by author-desc with data", async () => {
    const lightweightEditions = [
      { id: "e-a", contributors: [{ contributor: { nameCanonical: "alpha" } }] },
      { id: "e-b", contributors: [{ contributor: { nameCanonical: "bravo" } }] },
    ];
    editionFindManyMock
      .mockResolvedValueOnce(lightweightEditions)
      .mockResolvedValueOnce([{ id: "e-b" }, { id: "e-a" }]);
    editionCountMock.mockResolvedValue(2);
    const result = await getFilteredLibraryEditionsServerFn({ data: { sort: "author-desc" } });

    const secondCall = (editionFindManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["e-b", "e-a"]);
    expect(result.editions.map((e: { id: string }) => e.id)).toEqual(["e-b", "e-a"]);
  });

  it("sorts by narrator-desc with data", async () => {
    const lightweightEditions = [
      { id: "e-a", contributors: [{ contributor: { nameCanonical: "alpha" } }] },
      { id: "e-b", contributors: [{ contributor: { nameCanonical: "bravo" } }] },
    ];
    editionFindManyMock
      .mockResolvedValueOnce(lightweightEditions)
      .mockResolvedValueOnce([{ id: "e-b" }, { id: "e-a" }]);
    editionCountMock.mockResolvedValue(2);
    const result = await getFilteredLibraryEditionsServerFn({ data: { sort: "narrator-desc" } });

    const secondCall = (editionFindManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["e-b", "e-a"]);
    expect(result.editions.map((e: { id: string }) => e.id)).toEqual(["e-b", "e-a"]);
  });

  it("editions with no contributors sort last", async () => {
    const lightweightEditions = [
      { id: "e-none", contributors: [] },
      { id: "e-a", contributors: [{ contributor: { nameCanonical: "alpha" } }] },
    ];
    editionFindManyMock
      .mockResolvedValueOnce(lightweightEditions)
      .mockResolvedValueOnce([{ id: "e-a" }, { id: "e-none" }]);
    editionCountMock.mockResolvedValue(2);
    const result = await getFilteredLibraryEditionsServerFn({ data: { sort: "author-asc" } });

    const secondCall = (editionFindManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["e-a", "e-none"]);
    expect(result.editions.map((e: { id: string }) => e.id)).toEqual(["e-a", "e-none"]);
  });

  it("includes correct relations", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: {} });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          work: {
            include: {
              series: true,
              editions: {
                include: {
                  contributors: {
                    where: { role: "AUTHOR" },
                    include: { contributor: true },
                  },
                },
              },
            },
          },
          contributors: { include: { contributor: true } },
        },
      }),
    );
  });

  it("filters by text query via work title", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { q: "hobbit" } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        work: expect.objectContaining({
          OR: [
            { titleDisplay: { contains: "hobbit", mode: "insensitive" } },
            { titleCanonical: { contains: "hobbit", mode: "insensitive" } },
          ],
        }) as object,
      }),
    );
  });

  it("filters by format directly on edition", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { format: ["EBOOK"] } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        formatFamily: { in: ["EBOOK"] },
      }),
    );
  });

  it("filters by authorId via contributors", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { authorId: ["author-1"] } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        contributors: {
          some: {
            contributorId: { in: ["author-1"] },
            role: "AUTHOR",
          },
        },
      }),
    );
  });

  it("filters by seriesId via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { seriesId: ["series-1"] } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        work: expect.objectContaining({
          seriesId: { in: ["series-1"] },
        }) as object,
      }),
    );
  });

  it("filters by hasCover via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { hasCover: true } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        work: expect.objectContaining({
          coverPath: { not: null },
        }) as object,
      }),
    );
  });

  it("always includes availability filter", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: {} });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(
      expect.objectContaining({
        editionFiles: {
          some: {
            fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: ["KEPUB", "COVER", "SIDECAR"] } },
          },
        },
      }),
    );
  });

  it("passes same where to count as to findMany", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(5);
    await getFilteredLibraryEditionsServerFn({ data: { format: ["AUDIOBOOK"] } });

    const findManyWhere = (editionFindManyMock.mock.calls[0] as [{ where: object }])[0].where;
    expect(editionCountMock).toHaveBeenCalledWith({ where: findManyWhere });
  });

  it("returns empty editions when two-step sort has no results", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    const result = await getFilteredLibraryEditionsServerFn({ data: { sort: "author-asc" } });

    expect(result.editions).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("sorts by pageCount-desc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "pageCount-desc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { pageCount: "desc" } }),
    );
  });

  it("sorts by duration-asc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "duration-asc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { duration: "asc" } }),
    );
  });

  it("sorts by format-desc", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort: "format-desc" } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { formatFamily: "desc" } }),
    );
  });

  it.each([
    ["isbn13-asc", { isbn13: "asc" }],
    ["isbn13-desc", { isbn13: "desc" }],
    ["isbn10-asc", { isbn10: "asc" }],
    ["isbn10-desc", { isbn10: "desc" }],
    ["asin-asc", { asin: "asc" }],
    ["asin-desc", { asin: "desc" }],
  ] as const)("sorts by %s", async (sort, expectedOrderBy) => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { sort } });

    expect(editionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expectedOrderBy }),
    );
  });

  it("filters by enriched true via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { enriched: true } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ enrichmentStatus: "ENRICHED" }) as object,
    }));
  });

  it("filters by enriched false via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { enriched: false } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ enrichmentStatus: "STUB" }) as object,
    }));
  });

  it("filters by hasDescription true via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { hasDescription: true } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ description: { not: null } }) as object,
    }));
  });

  it("filters by hasDescription false via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { hasDescription: false } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ description: null }) as object,
    }));
  });

  it("filters by inSeries true via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { inSeries: true } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ seriesId: { not: null } }) as object,
    }));
  });

  it("filters by inSeries false via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { inSeries: false } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ seriesId: null }) as object,
    }));
  });

  it("filters by hasCover false via work", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({ data: { hasCover: false } });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where).toEqual(expect.objectContaining({
      work: expect.objectContaining({ coverPath: null }) as object,
    }));
  });

  it("combines multiple work-level filters with AND", async () => {
    editionFindManyMock.mockResolvedValue([]);
    editionCountMock.mockResolvedValue(0);
    await getFilteredLibraryEditionsServerFn({
      data: { q: "test", hasCover: true, seriesId: ["s-1"] },
    });

    const call = (editionFindManyMock.mock.calls[0] as [{ where: Record<string, object> }])[0];
    expect(call.where.work).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: [
              { titleDisplay: { contains: "test", mode: "insensitive" } },
              { titleCanonical: { contains: "test", mode: "insensitive" } },
            ],
          }),
        ]) as object[],
      }),
    );
  });
});
