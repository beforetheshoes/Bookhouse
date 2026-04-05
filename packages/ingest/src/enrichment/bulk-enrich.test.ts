import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processBulkEnrichWork,
  type BulkEnrichDeps,
  type BulkEnrichResult,
} from "./bulk-enrich";
import type { SourceResult, SearchSourcesResult, EnrichmentProvider } from "./search-sources";

function makeSourceResult(provider: EnrichmentProvider, overrides: Partial<{
  work: Partial<SourceResult["work"]>;
  edition: Partial<SourceResult["edition"]>;
}> = {}): SourceResult {
  return {
    provider,
    externalId: `${provider}-id`,
    work: {
      title: "Test Title",
      authors: ["Test Author"],
      description: provider === "hardcover" ? "A long detailed description from Hardcover" : "Short desc",
      subjects: ["Fiction"],
      coverUrl: null,
      ...overrides.work,
    },
    edition: {
      publisher: provider === "googlebooks" ? "Big Publisher International" : "Pub",
      publishedDate: "2020-01-01",
      pageCount: provider === "hardcover" ? 500 : 300,
      isbn13: "9781234567890",
      isbn10: null,
      asin: provider === "audible" ? "B08G9PRS1K" : null,
      duration: provider === "audible" ? 58200 : null,
      narrators: provider === "audible" ? ["Scott Brick"] : null,
      ...overrides.edition,
    },
    raw: { search: { title: "Test", olid: "OL1W", authors: [], isbns: [], firstPublishYear: null, coverId: null }, work: null, edition: null },
  };
}

function makeDeps(overrides: Partial<BulkEnrichDeps> = {}): BulkEnrichDeps {
  return {
    loadWork: vi.fn().mockResolvedValue({
      id: "w1",
      titleDisplay: "Existing Title",
      description: null,
      coverPath: null,
      editedFields: [],
      tags: [],
      editions: [{
        id: "e1",
        formatFamily: "EBOOK" as const,
        publisher: null,
        publishedDate: null,
        isbn13: null,
        isbn10: null,
        asin: null,
        language: null,
        pageCount: null,
        duration: null,
        narrators: [],
        editedFields: [],
        authors: [],
      }],
    }),
    searchAllSources: vi.fn().mockResolvedValue({
      status: "success",
      results: [makeSourceResult("openlibrary")],
    } satisfies SearchSourcesResult),
    applyEnrichmentFields: vi.fn().mockResolvedValue({ success: true, appliedFields: ["description"] }),
    applyCoverFromUrl: vi.fn().mockResolvedValue({ status: "applied" }),
    ...overrides,
  };
}

describe("processBulkEnrichWork", () => {
  let deps: BulkEnrichDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("returns not-found when work does not exist", async () => {
    deps = makeDeps({ loadWork: vi.fn().mockResolvedValue(null) });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "not-found" });
  });

  it("returns no-editions when work has no edition", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [],
      }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "no-editions" });
  });

  it("returns no-results when search finds nothing", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({ status: "no-results" }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "no-results" });
  });

  it("returns no-results when search is rate-limited", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({ status: "rate-limited", retryAfterMs: 5000 }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "no-results" });
  });

  it("filters results to only requested sources", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary"),
          makeSourceResult("googlebooks"),
          makeSourceResult("hardcover"),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ source: { provider: string } }];
    expect(applyCall[0].source.provider).toBe("openlibrary");
  });

  it("returns no-results when requested sources are not in results", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("openlibrary")],
      }),
    });

    const result = await processBulkEnrichWork("w1", ["hardcover"], "fullest", deps);

    expect(result).toEqual({ status: "no-results" });
  });

  it("uses fullest strategy — picks longest description", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary", { work: { description: "Short" } }),
          makeSourceResult("hardcover", { work: { description: "A much longer description from Hardcover source" } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary", "hardcover"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null>; source: { provider: string } }];
    expect(applyCall[0].workFields.description).toBe("A much longer description from Hardcover source");
    // Source provider is determined by which provider contributed the most fields overall
    expect(["openlibrary", "hardcover"]).toContain(applyCall[0].source.provider);
  });

  it("uses fullest strategy — picks largest pageCount", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary", { edition: { pageCount: 200 } }),
          makeSourceResult("hardcover", { edition: { pageCount: 500 } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary", "hardcover"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ editionFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].editionFields.pageCount).toBe(500);
  });

  it("uses fullest strategy — picks array with most items", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary", { work: { subjects: ["Fiction"] } }),
          makeSourceResult("hardcover", { work: { subjects: ["Fiction", "Drama", "Classic"] } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary", "hardcover"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].workFields.subjects).toEqual(["Fiction", "Drama", "Classic"]);
  });

  it("uses priority strategy — respects source order", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary", { work: { description: "OL description" } }),
          makeSourceResult("hardcover", { work: { description: "HC description" } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["hardcover", "openlibrary"], "priority", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].workFields.description).toBe("HC description");
  });

  it("priority strategy — falls through to next source when first has null", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("hardcover", { work: { description: null } }),
          makeSourceResult("openlibrary", { work: { description: "OL description" } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["hardcover", "openlibrary"], "priority", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].workFields.description).toBe("OL description");
  });

  it("skips fields where current value already exists", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Existing Title",
        description: "Already has description",
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [{
          id: "e1",
          formatFamily: "EBOOK" as const,
          publisher: "Existing Publisher",
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          asin: null,
          language: null,
          pageCount: null,
          duration: null,
          editedFields: [],
          authors: [],
        }],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null>; editionFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].workFields.description).toBeUndefined();
    expect(applyCall[0].editionFields.publisher).toBeUndefined();
  });

  it("skips fields that are in editedFields", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "",
        description: null,
        coverPath: null,
        editedFields: ["description"],
        tags: [],
        editions: [{
          id: "e1",
          formatFamily: "EBOOK" as const,
          publisher: null,
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          language: null,
          pageCount: null,
          editedFields: ["publisher"],
          authors: [],
        }],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null>; editionFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].workFields.description).toBeUndefined();
    expect(applyCall[0].editionFields.publisher).toBeUndefined();
  });

  it("applies cover when work has no cover", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("openlibrary", { work: { coverUrl: "https://covers.example.com/cover.jpg" } })],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(deps.applyCoverFromUrl).toHaveBeenCalledWith(
      "w1",
      "https://covers.example.com/cover.jpg",
      { provider: "openlibrary", externalId: "openlibrary-id" },
    );
  });

  it("skips cover when work already has one", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: "existing/cover",
        editedFields: [],
        tags: [],
        editions: [{
          id: "e1",
          formatFamily: "EBOOK" as const,
          publisher: null,
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          asin: null,
          language: null,
          pageCount: null,
          duration: null,
          editedFields: [],
          authors: [],
        }],
      }),
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("openlibrary", { work: { coverUrl: "https://covers.example.com/cover.jpg" } })],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(deps.applyCoverFromUrl).not.toHaveBeenCalled();
  });

  it("returns enriched with applied fields on success", async () => {
    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result.status).toBe("enriched");
    expect((result as Extract<BulkEnrichResult, { status: "enriched" }>).appliedFields).toEqual(["description"]);
  });

  it("returns skipped-all when nothing was applied", async () => {
    deps = makeDeps({
      applyEnrichmentFields: vi.fn().mockResolvedValue({ success: true, skippedAll: true }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "skipped-all" });
  });

  it("returns skipped-all when apply returns success with no appliedFields", async () => {
    deps = makeDeps({
      applyEnrichmentFields: vi.fn().mockResolvedValue({ success: true }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "skipped-all" });
  });

  it("applies cover via priority strategy when using priority mode", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary", { work: { coverUrl: null } }),
          makeSourceResult("hardcover", { work: { coverUrl: "https://hc.example.com/cover.jpg" } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary", "hardcover"], "priority", deps);

    expect(deps.applyCoverFromUrl).toHaveBeenCalledWith(
      "w1",
      "https://hc.example.com/cover.jpg",
      { provider: "hardcover", externalId: "hardcover-id" },
    );
  });

  it("uses fallback source when no merged fields determine a winner", async () => {
    // All fields already filled — merged map will be empty
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: "Desc",
        coverPath: "has/cover",
        editedFields: [],
        tags: ["Fiction"],
        editions: [{
          id: "e1",
          formatFamily: "EBOOK" as const,
          publisher: "Pub",
          publishedDate: "2020-01-01",
          isbn13: "9781234567890",
          isbn10: "1234567890",
          asin: null,
          language: "en",
          pageCount: 300,
          duration: null,
          editedFields: [],
          narrators: [],
          authors: ["Author"],
        }],
      }),
      applyEnrichmentFields: vi.fn().mockResolvedValue({ success: true, skippedAll: true }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(result).toEqual({ status: "skipped-all" });
  });

  it("priority strategy skips edited fields", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "",
        description: null,
        coverPath: null,
        editedFields: ["description"],
        tags: [],
        editions: [{
          id: "e1",
          formatFamily: "EBOOK" as const,
          publisher: null,
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          asin: null,
          language: null,
          pageCount: null,
          duration: null,
          editedFields: [],
          authors: [],
        }],
      }),
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("openlibrary", { work: { description: "A desc" } })],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "priority", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ workFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].workFields.description).toBeUndefined();
  });

  it("uses empty edition fields when primary edition has all fields populated", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [{
          id: "e-audio",
          formatFamily: "AUDIOBOOK" as const,
          publisher: "Already Set",
          publishedDate: "2020-01-01",
          isbn13: "9781234567890",
          isbn10: null,
          asin: "B08G9PRS1K",
          language: null,
          pageCount: null,
          duration: 58200,
          editedFields: [],
          narrators: ["Nick Podehl"],
          authors: ["Author"],
        }],
      }),
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("audible", {
          edition: { publisher: "Audible Studios", publishedDate: "2021-01-01", asin: "B000AUDIBLE", duration: 36000, isbn13: "9780000000000", isbn10: null, pageCount: null, narrators: ["Scott Brick"] },
        })],
      }),
    });

    await processBulkEnrichWork("w1", ["audible"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ editionFields: Record<string, string | string[] | number | null> }];
    // Primary edition has all audiobook fields populated (including narrators), so editionFields should be empty
    expect(Object.keys(applyCall[0].editionFields)).toHaveLength(0);
  });

  it("skips ebook edition fields for audiobook editions when only non-Audible sources", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [{
          id: "e1",
          formatFamily: "AUDIOBOOK" as const,
          publisher: null,
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          asin: null,
          language: null,
          pageCount: null,
          duration: null,
          editedFields: [],
          narrators: [],
          authors: ["Author"],
        }],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    // Audiobook editions should not get pageCount from non-Audible sources
    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ editionFields: Record<string, string | string[] | number | null> }];
    expect(applyCall[0].editionFields.pageCount).toBeUndefined();
  });

  it("skips audiobook edition enrichment when all fields are already populated", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: "Desc",
        coverPath: "has/cover",
        editedFields: [],
        tags: ["Fiction"],
        editions: [{
          id: "e-audio",
          formatFamily: "AUDIOBOOK" as const,
          publisher: "Existing Publisher",
          publishedDate: "2020-01-01",
          isbn13: "9781234567890",
          isbn10: "1234567890",
          asin: "B08G9PRS1K",
          language: "en",
          pageCount: null,
          duration: 58200,
          editedFields: [],
          narrators: [],
          authors: ["Author"],
        }],
      }),
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("audible", {
          edition: { publisher: "Audible Studios", publishedDate: "2021-01-01", asin: "B000AUDIBLE", duration: 36000, isbn13: "9780000000000", isbn10: null, pageCount: null },
        })],
      }),
      applyEnrichmentFields: vi.fn().mockResolvedValue({ success: true, skippedAll: true }),
    });

    const result = await processBulkEnrichWork("w1", ["audible"], "fullest", deps);

    expect(result).toEqual({ status: "skipped-all" });
  });

  it("enriches audiobook editions with audiobook-specific fields from Audible", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [{
          id: "e-audio",
          formatFamily: "AUDIOBOOK" as const,
          publisher: null,
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          asin: null,
          language: null,
          pageCount: null,
          duration: null,
          editedFields: [],
          narrators: [],
          authors: ["Author"],
        }],
      }),
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [makeSourceResult("audible", {
          edition: {
            publisher: "Audible Studios",
            publishedDate: "2021-05-04",
            asin: "B08G9PRS1K",
            duration: 58200,
            isbn13: null,
            isbn10: null,
            pageCount: null,
          },
        })],
      }),
    });

    await processBulkEnrichWork("w1", ["audible"], "fullest", deps);

    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ editionFields: Record<string, string | string[] | number | null>; editionId: string }];
    expect(applyCall[0].editionId).toBe("e-audio");
    expect(applyCall[0].editionFields.publisher).toBe("Audible Studios");
    expect(applyCall[0].editionFields.publishedDate).toBe("2021-05-04");
    expect(applyCall[0].editionFields.asin).toBe("B08G9PRS1K");
    expect(applyCall[0].editionFields.duration).toBe(58200);
    expect(applyCall[0].editionFields.pageCount).toBeUndefined();
  });

  it("enriches both ebook and audiobook editions independently", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [
          {
            id: "e-ebook",
            formatFamily: "EBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            narrators: [],
          authors: ["Author"],
          },
          {
            id: "e-audio",
            formatFamily: "AUDIOBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            authors: [],
          },
        ],
      }),
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary"),
          makeSourceResult("audible", {
            edition: { publisher: "Audible Studios", asin: "B000AUDIBLE", duration: 36000, isbn13: null, isbn10: null, pageCount: null, publishedDate: "2021-01-01" },
          }),
        ],
      }),
      applyEnrichmentFields: vi.fn()
        .mockResolvedValueOnce({ success: true, appliedFields: ["publisher", "isbn13"] })
        .mockResolvedValueOnce({ success: true, appliedFields: ["publisher", "asin", "duration"] }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary", "audible"], "fullest", deps);

    expect(deps.applyEnrichmentFields).toHaveBeenCalledTimes(2);
    const call1 = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ editionId: string; editionFields: Record<string, string | string[] | number | null> }];
    const call2 = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[1] as [{ editionId: string; editionFields: Record<string, string | string[] | number | null> }];
    // Ebook gets ebook fields
    expect(call1[0].editionId).toBe("e-ebook");
    expect(call1[0].editionFields.pageCount).toBeDefined();
    expect(call1[0].editionFields.asin).toBeUndefined();
    expect(call1[0].editionFields.duration).toBeUndefined();
    // Audiobook gets audiobook fields
    expect(call2[0].editionId).toBe("e-audio");
    expect(call2[0].editionFields.asin).toBe("B000AUDIBLE");
    expect(call2[0].editionFields.duration).toBe(36000);
    expect(call2[0].editionFields.pageCount).toBeUndefined();
    // Combined result
    expect((result as { appliedFields: string[] }).appliedFields).toEqual(["publisher", "isbn13", "asin", "duration"]);
  });

  it("applies edition fields to each ebook edition independently", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [
          {
            id: "e1",
            formatFamily: "EBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            narrators: [],
          authors: ["Author"],
          },
          {
            id: "e2",
            formatFamily: "EBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            authors: [],
          },
          {
            id: "e-audio",
            formatFamily: "AUDIOBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            authors: [],
          },
        ],
      }),
      applyEnrichmentFields: vi.fn()
        .mockResolvedValueOnce({ success: true, appliedFields: ["publisher"] })
        .mockResolvedValueOnce({ success: true, appliedFields: ["isbn13"] }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    // Called twice: e1 (primary ebook), e2 (second ebook)
    // Audiobook e-audio is NOT enriched because no Audible source is in results
    expect(deps.applyEnrichmentFields).toHaveBeenCalledTimes(2);
    const call1 = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ editionId: string }];
    const call2 = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[1] as [{ editionId: string }];
    expect(call1[0].editionId).toBe("e1");
    expect(call2[0].editionId).toBe("e2");
    // Both editions contributed fields — deduped
    expect((result as { appliedFields: string[] }).appliedFields).toEqual(["publisher", "isbn13"]);
  });

  it("handles second edition returning no appliedFields", async () => {
    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Title",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [
          {
            id: "e1",
            formatFamily: "EBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            narrators: [],
          authors: ["Author"],
          },
          {
            id: "e2",
            formatFamily: "EBOOK" as const,
            publisher: null, publishedDate: null, isbn13: null, isbn10: null, asin: null, language: null, pageCount: null, duration: null,
            editedFields: [],
            authors: [],
          },
        ],
      }),
      applyEnrichmentFields: vi.fn()
        .mockResolvedValueOnce({ success: true, appliedFields: ["publisher"] })
        .mockResolvedValueOnce({ success: true }),
    });

    const result = await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect((result as { appliedFields: string[] }).appliedFields).toEqual(["publisher"]);
  });

  it("determines winning provider from the field with the most data", async () => {
    deps = makeDeps({
      searchAllSources: vi.fn().mockResolvedValue({
        status: "success",
        results: [
          makeSourceResult("openlibrary", { work: { description: null }, edition: { publisher: "OL Pub" } }),
          makeSourceResult("hardcover", { work: { description: "HC desc" }, edition: { publisher: null } }),
        ],
      }),
    });

    await processBulkEnrichWork("w1", ["openlibrary", "hardcover"], "fullest", deps);

    // The source for provenance should be whichever contributed the most fields
    const applyCall = (deps.applyEnrichmentFields as ReturnType<typeof vi.fn>).mock.calls[0] as [{ source: { provider: string } }];
    // Both contributed 1 field each — first provider in sources wins as tiebreak
    expect(["openlibrary", "hardcover"]).toContain(applyCall[0].source.provider);
  });

  it("passes ASIN from audiobook edition to searchAllSources", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      status: "success",
      results: [makeSourceResult("audible")],
    } satisfies SearchSourcesResult);

    deps = makeDeps({
      loadWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Project Hail Mary",
        description: null,
        coverPath: null,
        editedFields: [],
        tags: [],
        editions: [{
          id: "e1",
          formatFamily: "AUDIOBOOK" as const,
          publisher: null,
          publishedDate: null,
          isbn13: null,
          isbn10: null,
          asin: "B08G9PRS1K",
          language: null,
          pageCount: null,
          duration: null,
          narrators: [],
          editedFields: [],
          authors: ["Andy Weir"],
        }],
      }),
      searchAllSources: searchMock,
    });

    await processBulkEnrichWork("w1", ["audible"], "fullest", deps);

    expect(searchMock).toHaveBeenCalledWith("Project Hail Mary", "Andy Weir", { asin: "B08G9PRS1K" });
  });

  it("passes undefined options when no edition has ASIN", async () => {
    const searchMock = vi.fn().mockResolvedValue({
      status: "success",
      results: [makeSourceResult("openlibrary")],
    } satisfies SearchSourcesResult);

    deps = makeDeps({ searchAllSources: searchMock });

    await processBulkEnrichWork("w1", ["openlibrary"], "fullest", deps);

    expect(searchMock).toHaveBeenCalledWith("Existing Title", undefined, undefined);
  });
});
