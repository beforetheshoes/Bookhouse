import { describe, it, expect, vi } from "vitest";
import { searchAllSources, type SearchSourcesDeps, type SourceResult } from "./search-sources";
import type { OLSearchResult, OLWork, OLEdition } from "./open-library";
import type { GBVolume } from "./google-books";
import type { HCBook } from "./hardcover";
import type { AudibleProduct } from "./audible";

function makeDeps(overrides: Partial<SearchSourcesDeps> = {}): SearchSourcesDeps {
  return {
    searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([]),
    getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(null),
    getOLEdition: vi.fn<SearchSourcesDeps["getOLEdition"]>().mockResolvedValue(null),
    searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([]),
    searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue([]),
    searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([]),
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
    ...overrides,
  };
}

const olSearchResult: OLSearchResult = {
  olid: "OL123W",
  title: "Dune",
  authors: ["Frank Herbert"],
  firstPublishYear: 1965,
  isbns: ["9780441172719", "0441172717"],
  coverId: 42,
};

const olWork: OLWork = {
  olid: "OL123W",
  title: "Dune",
  description: "A desert planet epic",
  coverIds: [42],
  subjects: ["Science Fiction"],
};

const olEdition: OLEdition = {
  olid: "OL456M",
  title: "Dune",
  publishers: ["Chilton Books"],
  publishDate: "August 1965",
  pageCount: 412,
  coverIds: [99],
  workOlid: "OL123W",
};

const gbVolume: GBVolume = {
  googleBooksId: "gb_abc",
  title: "Dune",
  subtitle: null,
  authors: ["Frank Herbert"],
  publisher: "Chilton Books",
  publishedDate: "1965",
  description: "The desert saga",
  pageCount: 412,
  categories: ["Fiction"],
  isbn13: "9780441172719",
  isbn10: "0441172717",
  thumbnailUrl: "https://books.google.com/thumb.jpg",
};

const hcBook: HCBook = {
  hardcoverId: "hc_42",
  title: "Dune",
  description: "Frank Herbert's masterpiece",
  authors: ["Frank Herbert"],
  imageUrl: "https://hardcover.app/dune.jpg",
  categories: ["Sci-Fi"],
  publisher: "Chilton",
  publishedDate: "1965-08-01",
  pageCount: 412,
  isbn13: "9780441172719",
};

const audibleProduct: AudibleProduct = {
  asin: "B08G9PRS1K",
  title: "Dune",
  authors: ["Frank Herbert"],
  narrators: ["Scott Brick"],
  publisher: "Macmillan Audio",
  publishedDate: "2007-07-17",
  durationSeconds: 79200,
  language: "english",
  description: "A desert planet epic audiobook",
  coverUrl: "https://m.media-amazon.com/images/I/dune.jpg",
};

describe("searchAllSources", () => {
  it("returns rate-limited when rate limit is exceeded", async () => {
    const deps = makeDeps({ checkRateLimit: vi.fn().mockReturnValue({ allowed: false, retryAfterMs: 5000 }) });

    const result = await searchAllSources("Dune", "Herbert", deps);

    expect(result).toEqual({ status: "rate-limited", retryAfterMs: 5000 });
    expect(deps.searchOL).not.toHaveBeenCalled();
  });

  it("returns no-results when all sources return empty", async () => {
    const deps = makeDeps();

    const result = await searchAllSources("Nonexistent", undefined, deps);

    expect(result).toEqual({ status: "no-results" });
  });

  it("returns results from all three sources", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([olSearchResult]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(olWork),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([gbVolume]),
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue([hcBook]),
    });

    const result = await searchAllSources("Dune", "Herbert", deps);

    expect(result.status).toBe("success");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.provider)).toEqual(["openlibrary", "googlebooks", "hardcover"]);
  });

  it("normalizes Open Library data with work + edition", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([olSearchResult]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(olWork),
      getOLEdition: vi.fn<SearchSourcesDeps["getOLEdition"]>().mockResolvedValue(olEdition),
    });

    const result = await searchAllSources("Dune", "Herbert", deps);

    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.provider).toBe("openlibrary");
    expect(ol.externalId).toBe("OL123W");
    expect(ol.work.title).toBe("Dune");
    expect(ol.work.authors).toEqual(["Frank Herbert"]);
    expect(ol.work.description).toBe("A desert planet epic");
    expect(ol.work.subjects).toEqual(["Science Fiction"]);
    expect(ol.work.coverUrl).toBe("https://covers.openlibrary.org/b/id/42-L.jpg");
    // Edition data comes from the OLEdition endpoint
    expect(ol.edition.publisher).toBe("Chilton Books");
    expect(ol.edition.publishedDate).toBe("August 1965");
    expect(ol.edition.pageCount).toBe(412);
    expect(ol.edition.isbn13).toBe("9780441172719");
    expect(ol.edition.isbn10).toBe("0441172717");
  });

  it("normalizes Open Library data without edition (no ISBN)", async () => {
    const noIsbnSearch: OLSearchResult = { ...olSearchResult, isbns: [] };
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([noIsbnSearch]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(olWork),
    });

    const result = await searchAllSources("Dune", "Herbert", deps);

    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.edition.publisher).toBeNull();
    expect(ol.edition.publishedDate).toBe("1965");
    expect(ol.edition.pageCount).toBeNull();
    expect(deps.getOLEdition).not.toHaveBeenCalled();
  });

  it("continues when OL edition fetch fails", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([olSearchResult]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(olWork),
      getOLEdition: vi.fn<SearchSourcesDeps["getOLEdition"]>().mockRejectedValue(new Error("timeout")),
    });

    const result = await searchAllSources("Dune", "Herbert", deps);

    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.edition.publisher).toBeNull();
    expect(ol.edition.pageCount).toBeNull();
  });

  it("normalizes Google Books data correctly", async () => {
    const deps = makeDeps({
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([gbVolume]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const gb = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(gb.provider).toBe("googlebooks");
    expect(gb.externalId).toBe("gb_abc");
    expect(gb.work.authors).toEqual(["Frank Herbert"]);
    expect(gb.work.description).toBe("The desert saga");
    expect(gb.work.subjects).toEqual(["Fiction"]);
    expect(gb.work.coverUrl).toBe("https://books.google.com/thumb.jpg");
    expect(gb.edition.publisher).toBe("Chilton Books");
    expect(gb.edition.pageCount).toBe(412);
  });

  it("normalizes Hardcover data correctly", async () => {
    const deps = makeDeps({
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue([hcBook]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const hc = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(hc.provider).toBe("hardcover");
    expect(hc.externalId).toBe("hc_42");
    expect(hc.work.authors).toEqual(["Frank Herbert"]);
    expect(hc.work.description).toBe("Frank Herbert's masterpiece");
    expect(hc.edition.isbn10).toBeNull();
  });

  it("gracefully handles one source failing", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockRejectedValue(new Error("Network error")),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([gbVolume]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    expect(result.status).toBe("success");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(1);
    expect((results[0] as SourceResult).provider).toBe("googlebooks");
  });

  it("gracefully handles two sources failing", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockRejectedValue(new Error("fail")),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockRejectedValue(new Error("fail")),
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue([hcBook]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    expect(result.status).toBe("success");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(1);
    expect((results[0] as SourceResult).provider).toBe("hardcover");
  });

  it("returns no-results when all sources fail", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockRejectedValue(new Error("fail")),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockRejectedValue(new Error("fail")),
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockRejectedValue(new Error("fail")),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    expect(result).toEqual({ status: "no-results" });
  });

  it("handles null returns from sources", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue(null),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue(null),
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue(null),
    });

    const result = await searchAllSources("Nothing", undefined, deps);

    expect(result).toEqual({ status: "no-results" });
  });

  it("continues if getOLWork fails after search succeeds", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([olSearchResult]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockRejectedValue(new Error("timeout")),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    expect(result.status).toBe("success");
    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.work.description).toBeNull(); // no work details
    expect(ol.work.coverUrl).toBe("https://covers.openlibrary.org/b/id/42-L.jpg"); // from search coverId
  });

  it("uses work coverIds when search coverId is null", async () => {
    const noCoverSearch: OLSearchResult = { ...olSearchResult, coverId: null };
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([noCoverSearch]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(olWork),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.work.coverUrl).toBe("https://covers.openlibrary.org/b/id/42-L.jpg");
  });

  it("returns null coverUrl when no cover IDs available", async () => {
    const noCoverSearch: OLSearchResult = { ...olSearchResult, coverId: null };
    const noCoverWork: OLWork = { ...olWork, coverIds: [] };
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([noCoverSearch]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(noCoverWork),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.work.coverUrl).toBeNull();
  });

  it("handles OL search result with no ISBNs matching expected lengths", async () => {
    const noIsbnSearch: OLSearchResult = { ...olSearchResult, isbns: ["12345"], firstPublishYear: null };
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([noIsbnSearch]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const ol = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(ol.edition.isbn13).toBeNull();
    expect(ol.edition.isbn10).toBeNull();
    expect(ol.edition.publishedDate).toBeNull();
  });

  it("passes title and author to all sources", async () => {
    const deps = makeDeps();

    await searchAllSources("The Hobbit", "Tolkien", deps);

    expect(deps.searchOL).toHaveBeenCalledWith("The Hobbit", "Tolkien");
    expect(deps.searchGB).toHaveBeenCalledWith("The Hobbit", "Tolkien");
    expect(deps.searchHC).toHaveBeenCalledWith("The Hobbit", "Tolkien");
    expect(deps.searchAudible).toHaveBeenCalledWith("The Hobbit", "Tolkien");
  });

  it("normalizes Audible data correctly", async () => {
    const deps = makeDeps({
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([audibleProduct]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const audible = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(audible.provider).toBe("audible");
    expect(audible.externalId).toBe("B08G9PRS1K");
    expect(audible.work.title).toBe("Dune");
    expect(audible.work.authors).toEqual(["Frank Herbert"]);
    expect(audible.work.description).toBe("A desert planet epic audiobook");
    expect(audible.work.coverUrl).toBe("https://m.media-amazon.com/images/I/dune.jpg");
    expect(audible.edition.publisher).toBe("Macmillan Audio");
    expect(audible.edition.publishedDate).toBe("2007-07-17");
    expect(audible.edition.asin).toBe("B08G9PRS1K");
    expect(audible.edition.duration).toBe(79200);
    expect(audible.edition.isbn13).toBeNull();
    expect(audible.edition.isbn10).toBeNull();
    expect(audible.edition.pageCount).toBeNull();
    expect(audible.edition.narrators).toEqual(["Scott Brick"]);
  });

  it("includes all four sources when all return results", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([olSearchResult]),
      getOLWork: vi.fn<SearchSourcesDeps["getOLWork"]>().mockResolvedValue(olWork),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([gbVolume]),
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue([hcBook]),
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([audibleProduct]),
    });

    const result = await searchAllSources("Dune", "Herbert", deps);

    expect(result.status).toBe("success");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.provider)).toEqual(["openlibrary", "googlebooks", "hardcover", "audible"]);
  });

  it("sets asin and duration to null for non-Audible sources", async () => {
    const deps = makeDeps({
      searchOL: vi.fn<SearchSourcesDeps["searchOL"]>().mockResolvedValue([olSearchResult]),
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([gbVolume]),
      searchHC: vi.fn<SearchSourcesDeps["searchHC"]>().mockResolvedValue([hcBook]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const results = (result as { status: "success"; results: SourceResult[] }).results;
    for (const r of results) {
      expect(r.edition.asin).toBeNull();
      expect(r.edition.duration).toBeNull();
      expect(r.edition.narrators).toBeNull();
    }
  });

  it("returns null narrators when Audible product has empty narrators", async () => {
    const noNarrators: AudibleProduct = { ...audibleProduct, narrators: [] };
    const deps = makeDeps({
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([noNarrators]),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    const audible = (result as { status: "success"; results: SourceResult[] }).results[0] as SourceResult;
    expect(audible.edition.narrators).toBeNull();
  });

  it("uses ASIN lookup for Audible when asin is provided", async () => {
    const deps = makeDeps({
      lookupAudibleByAsin: vi.fn<NonNullable<SearchSourcesDeps["lookupAudibleByAsin"]>>().mockResolvedValue(audibleProduct),
    });

    const result = await searchAllSources("Dune", "Herbert", deps, { asin: "B08G9PRS1K" });

    expect(deps.lookupAudibleByAsin).toHaveBeenCalledWith("B08G9PRS1K");
    expect(deps.searchAudible).not.toHaveBeenCalled();
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(1);
    expect((results[0] as SourceResult).provider).toBe("audible");
    expect((results[0] as SourceResult).externalId).toBe("B08G9PRS1K");
  });

  it("falls back to title+author search when ASIN lookup returns null", async () => {
    const deps = makeDeps({
      lookupAudibleByAsin: vi.fn<NonNullable<SearchSourcesDeps["lookupAudibleByAsin"]>>().mockResolvedValue(null),
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([audibleProduct]),
    });

    const result = await searchAllSources("Dune", "Herbert", deps, { asin: "B000MISSING" });

    expect(deps.lookupAudibleByAsin).toHaveBeenCalledWith("B000MISSING");
    expect(deps.searchAudible).toHaveBeenCalledWith("Dune", "Herbert");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(1);
    expect((results[0] as SourceResult).provider).toBe("audible");
  });

  it("falls back to title+author search when ASIN lookup throws", async () => {
    const deps = makeDeps({
      lookupAudibleByAsin: vi.fn<NonNullable<SearchSourcesDeps["lookupAudibleByAsin"]>>().mockRejectedValue(new Error("API error")),
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([audibleProduct]),
    });

    const result = await searchAllSources("Dune", "Herbert", deps, { asin: "B08G9PRS1K" });

    expect(deps.searchAudible).toHaveBeenCalledWith("Dune", "Herbert");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(1);
  });

  it("does not call lookupAudibleByAsin when no asin provided", async () => {
    const lookupMock = vi.fn<NonNullable<SearchSourcesDeps["lookupAudibleByAsin"]>>();
    const deps = makeDeps({
      lookupAudibleByAsin: lookupMock,
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockResolvedValue([audibleProduct]),
    });

    await searchAllSources("Dune", "Herbert", deps);

    expect(lookupMock).not.toHaveBeenCalled();
    expect(deps.searchAudible).toHaveBeenCalledWith("Dune", "Herbert");
  });

  it("gracefully handles Audible source failing", async () => {
    const deps = makeDeps({
      searchGB: vi.fn<SearchSourcesDeps["searchGB"]>().mockResolvedValue([gbVolume]),
      searchAudible: vi.fn<SearchSourcesDeps["searchAudible"]>().mockRejectedValue(new Error("timeout")),
    });

    const result = await searchAllSources("Dune", undefined, deps);

    expect(result.status).toBe("success");
    const results = (result as { status: "success"; results: SourceResult[] }).results;
    expect(results).toHaveLength(1);
    expect((results[0] as SourceResult).provider).toBe("googlebooks");
  });
});
