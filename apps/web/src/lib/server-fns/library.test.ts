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

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findMany: findManyMock, count: countMock },
    edition: { groupBy: editionGroupByMock },
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

  it("calls db.work.findMany with correct include and availability filter", async () => {
    findManyMock.mockResolvedValue([]);
    await getLibraryWorksServerFn();
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        editions: {
          some: {
            editionFiles: {
              some: {
                fileAsset: { availabilityStatus: "PRESENT" },
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
        enrichment: { enriched: 0, unenriched: 0 },
        description: { withDescription: 0, withoutDescription: 0 },
        series: { inSeries: 0, standalone: 0 },
        isbn: { withIsbn: 0, withoutIsbn: 0 },
      },
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
        orderBy: { titleCanonical: "desc" },
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
        }) as unknown,
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
        }) as unknown,
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
        }) as unknown,
      }),
    );
  });

  it("filters by publisher", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
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

  it("combines format + authorId into a single editions filter with AND", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"], authorId: ["author-1"] },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
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

  it("combines format + publisher into a single editions filter with AND", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { format: ["AUDIOBOOK"], publisher: ["Penguin"] },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
    expect(call.where).toEqual(
      expect.objectContaining({
        editions: {
          some: {
            AND: [
              { formatFamily: { in: ["AUDIOBOOK"] } },
              { publisher: { in: ["Penguin"] } },
            ],
          },
        },
      }),
    );
  });

  it("combines authorId + publisher into a single editions filter with AND", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { authorId: ["author-1"], publisher: ["Penguin"] },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
    expect(call.where).toEqual(
      expect.objectContaining({
        editions: {
          some: {
            AND: [
              {
                contributors: {
                  some: { contributorId: { in: ["author-1"] }, role: "AUTHOR" },
                },
              },
              { publisher: { in: ["Penguin"] } },
            ],
          },
        },
      }),
    );
  });

  it("combines format + authorId + publisher into a single editions filter with AND", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"], authorId: ["author-1"], publisher: ["Penguin"] },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
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
              { publisher: { in: ["Penguin"] } },
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

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
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

  it("scopes cover facet counts to active search filter (excludes hasCover)", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    countMock.mockResolvedValue(5);

    await getFilteredLibraryWorksServerFn({ data: { q: "wind" } });

    // Cover count queries should include the search filter but NOT hasCover
    // countMock calls: [0] = totalCount, [1] = withCover, [2] = withoutCover
    const availabilityAnd = [
      {
        editions: {
          some: {
            editionFiles: {
              some: {
                fileAsset: { availabilityStatus: "PRESENT" },
              },
            },
          },
        },
      },
    ];
    expect(countMock).toHaveBeenNthCalledWith(2, {
      where: {
        OR: [
          { titleDisplay: { contains: "wind", mode: "insensitive" } },
          { titleCanonical: { contains: "wind", mode: "insensitive" } },
        ],
        AND: availabilityAnd,
        coverPath: { not: null },
      },
    });
    expect(countMock).toHaveBeenNthCalledWith(3, {
      where: {
        OR: [
          { titleDisplay: { contains: "wind", mode: "insensitive" } },
          { titleCanonical: { contains: "wind", mode: "insensitive" } },
        ],
        AND: availabilityAnd,
        coverPath: null,
      },
    });
  });

  it("scopes format facet counts to active search filter (excludes format)", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({ data: { q: "wind" } });

    expect(editionGroupByMock).toHaveBeenCalledWith({
      by: ["formatFamily"],
      _count: { _all: true },
      where: {
        work: {
          OR: [
            { titleDisplay: { contains: "wind", mode: "insensitive" } },
            { titleCanonical: { contains: "wind", mode: "insensitive" } },
          ],
          AND: [
            {
              editions: {
                some: {
                  editionFiles: {
                    some: {
                      fileAsset: { availabilityStatus: "PRESENT" },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });
  });

  it("cover facet counts exclude hasCover filter but include format filter", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    countMock.mockResolvedValue(5);

    await getFilteredLibraryWorksServerFn({
      data: { format: ["EBOOK"], hasCover: false },
    });

    // Cover count queries should include format but NOT hasCover
    const availabilityAnd = [
      {
        editions: {
          some: {
            editionFiles: {
              some: {
                fileAsset: { availabilityStatus: "PRESENT" },
              },
            },
          },
        },
      },
    ];
    expect(countMock).toHaveBeenNthCalledWith(2, {
      where: {
        editions: { some: { formatFamily: { in: ["EBOOK"] } } },
        AND: availabilityAnd,
        coverPath: { not: null },
      },
    });
    expect(countMock).toHaveBeenNthCalledWith(3, {
      where: {
        editions: { some: { formatFamily: { in: ["EBOOK"] } } },
        AND: availabilityAnd,
        coverPath: null,
      },
    });
  });

  it("returns series facet counts from work.count", async () => {
    findManyMock.mockResolvedValue([]);
    editionGroupByMock.mockResolvedValue([]);

    // 11 countMock calls: totalCount, withCover, withoutCover,
    // enriched, unenriched, withDescription, withoutDescription,
    // inSeries, standalone, withIsbn, withoutIsbn
    countMock
      .mockResolvedValueOnce(0)   // totalCount
      .mockResolvedValueOnce(0)   // withCover
      .mockResolvedValueOnce(0)   // withoutCover
      .mockResolvedValueOnce(0)   // enriched
      .mockResolvedValueOnce(0)   // unenriched
      .mockResolvedValueOnce(0)   // withDescription
      .mockResolvedValueOnce(0)   // withoutDescription
      .mockResolvedValueOnce(5)   // inSeries
      .mockResolvedValueOnce(3)   // standalone
      .mockResolvedValueOnce(0)   // withIsbn
      .mockResolvedValueOnce(0);  // withoutIsbn

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

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
    expect(call.where).toEqual(
      expect.objectContaining({
        AND: [
          {
            editions: {
              some: {
                editionFiles: {
                  some: {
                    fileAsset: { availabilityStatus: "PRESENT" },
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
        }) as unknown,
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
        }) as unknown,
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
        }) as unknown,
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
        }) as unknown,
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
        }) as unknown,
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
        }) as unknown,
      }),
    );
  });

  it("filters by hasIsbn true (combined with format + authorId)", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { hasIsbn: true, format: ["EBOOK"], authorId: ["author-1"] },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
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
              { OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }] },
            ],
          },
        },
      }),
    );
  });

  it("filters by hasIsbn false (combined with format + authorId)", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { hasIsbn: false, format: ["EBOOK"], authorId: ["author-1"] },
    });

    const call = (findManyMock.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
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
              { isbn13: null, isbn10: null },
            ],
          },
        },
      }),
    );
  });
});
