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

vi.mock("@bookhouse/db", () => ({
  db: {
    work: { findMany: findManyMock, count: countMock },
    edition: { groupBy: editionGroupByMock },
  },
}));

import {
  getLibraryWorksServerFn,
  getFilteredLibraryWorksServerFn,
  getAllFilteredWorkIdsServerFn,
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
        orderBy: { titleCanonical: "asc" },
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
      isbn: { withIsbn: 0, withoutIsbn: 0 },
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

  it("sorts by publisher-asc using two-step approach", async () => {
    const lightweightWorks = [
      { id: "w-z", editions: [{ publisher: "Zebra Press", formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-a", editions: [{ publisher: "Alpha Books", formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-null", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-none", editions: [] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-null" }, { id: "w-a" }, { id: "w-z" }, { id: "w-none" }]);
    countMock.mockResolvedValue(4);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "publisher-asc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    // "" (null publisher) < "Alpha Books" < "Zebra Press" < "\uffff" (no editions)
    expect(secondCall.where.id.in).toEqual(["w-null", "w-a", "w-z", "w-none"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-null", "w-a", "w-z", "w-none"]);
  });

  it("sorts by publisher-desc using two-step approach", async () => {
    const lightweightWorks = [
      { id: "w-a", editions: [{ publisher: "Alpha Books", formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-z", editions: [{ publisher: "Zebra Press", formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-z" }, { id: "w-a" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "publisher-desc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["w-z", "w-a"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-z", "w-a"]);
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

  it("sorts by isbn-asc using two-step approach", async () => {
    const lightweightWorks = [
      { id: "w-9", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: "9999999999999", isbn10: null, contributors: [] }] },
      { id: "w-1", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: "1111111111111", isbn10: null, contributors: [] }] },
      { id: "w-10", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: "5555555555", contributors: [] }] },
      { id: "w-noisbn", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
      { id: "w-none", editions: [] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-noisbn" }, { id: "w-1" }, { id: "w-10" }, { id: "w-9" }, { id: "w-none" }]);
    countMock.mockResolvedValue(5);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "isbn-asc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    // "" (no isbn) < isbn13 "1111..." < isbn10 "5555..." < isbn13 "9999..." < no-editions "\uffff"
    expect(secondCall.where.id.in).toEqual(["w-noisbn", "w-1", "w-10", "w-9", "w-none"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-noisbn", "w-1", "w-10", "w-9", "w-none"]);
  });

  it("sorts by isbn-desc using two-step approach", async () => {
    const lightweightWorks = [
      { id: "w-1", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: "1111111111111", isbn10: null, contributors: [] }] },
      { id: "w-9", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: "9999999999999", isbn10: null, contributors: [] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-9" }, { id: "w-1" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "isbn-desc" },
    });
    const secondCall = (findManyMock.mock.calls[1] as [{ where: { id: { in: string[] } } }])[0];
    expect(secondCall.where.id.in).toEqual(["w-9", "w-1"]);
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-9", "w-1"]);
  });

  it("publisher sort handles works with no editions", async () => {
    const lightweightWorks = [
      { id: "w-none", editions: [] },
      { id: "w-pub", editions: [{ publisher: "Alpha Books", formatFamily: "EBOOK", isbn13: null, isbn10: null, contributors: [] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-pub" }, { id: "w-none" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "publisher-asc" },
    });
    // Alpha Books sorts before \uffff (no editions fallback)
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-pub", "w-none"]);
  });

  it("isbn sort falls back to isbn10 when isbn13 is null", async () => {
    const lightweightWorks = [
      { id: "w-9", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: "9999999999", contributors: [] }] },
      { id: "w-1", editions: [{ publisher: null, formatFamily: "EBOOK", isbn13: null, isbn10: "1111111111", contributors: [] }] },
    ];
    findManyMock
      .mockResolvedValueOnce(lightweightWorks)
      .mockResolvedValueOnce([{ id: "w-1" }, { id: "w-9" }]);
    countMock.mockResolvedValue(2);
    editionGroupByMock.mockResolvedValue([]);
    const result = await getFilteredLibraryWorksServerFn({
      data: { sort: "isbn-asc" },
    });
    expect(result.works.map((w: { id: string }) => w.id)).toEqual(["w-1", "w-9"]);
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

  it("combines format + publisher into a single editions filter with AND", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);
    await getFilteredLibraryWorksServerFn({
      data: { format: ["AUDIOBOOK"], publisher: ["Penguin"] },
    });

    const call = findManyMock.mock.calls[0]?.[0] as { where: Record<string, object | string | boolean | null> };
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

    const call = findManyMock.mock.calls[0]?.[0] as { where: Record<string, object | string | boolean | null> };
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

  it("filters by hasIsbn true (combined with format + authorId)", async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    editionGroupByMock.mockResolvedValue([]);

    await getFilteredLibraryWorksServerFn({
      data: { hasIsbn: true, format: ["EBOOK"], authorId: ["author-1"] },
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
              { isbn13: null, isbn10: null },
            ],
          },
        },
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

    // 22 count calls: 11 filtered + 11 unfiltered
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
      .mockResolvedValueOnce(2)   // withIsbn (filtered)
      .mockResolvedValueOnce(1)   // withoutIsbn (filtered)
      .mockResolvedValueOnce(12)  // withCover (unfiltered)
      .mockResolvedValueOnce(3)   // withoutCover (unfiltered)
      .mockResolvedValueOnce(8)   // enriched (unfiltered)
      .mockResolvedValueOnce(7)   // unenriched (unfiltered)
      .mockResolvedValueOnce(6)   // withDescription (unfiltered)
      .mockResolvedValueOnce(9)   // withoutDescription (unfiltered)
      .mockResolvedValueOnce(4)   // inSeries (unfiltered)
      .mockResolvedValueOnce(11)  // standalone (unfiltered)
      .mockResolvedValueOnce(10)  // withIsbn (unfiltered)
      .mockResolvedValueOnce(5);  // withoutIsbn (unfiltered)

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
      isbn: { withIsbn: 10, withoutIsbn: 5 },
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

    // Unfiltered cover counts (calls 12 and 13 of countMock)
    expect(countMock).toHaveBeenNthCalledWith(12, {
      where: { AND: [baseWhere, { coverPath: { not: null } }] },
    });
    expect(countMock).toHaveBeenNthCalledWith(13, {
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
