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

const importJobCreateMock = vi.fn();
const workUpdateMock = vi.fn();
const editionUpdateMock = vi.fn();
const workFindUniqueMock = vi.fn();
const editionFindUniqueMock = vi.fn();
const editionFindManyMock = vi.fn();
const externalLinkUpsertMock = vi.fn();
const externalLinkFindManyMock = vi.fn();
const tagFindFirstMock = vi.fn();
const tagCreateMock = vi.fn();
const workTagUpsertMock = vi.fn();
const contributorFindFirstMock = vi.fn();
const contributorCreateMock = vi.fn();
const editionContributorDeleteManyMock = vi.fn();
const editionContributorCreateManyMock = vi.fn();
const enqueueLibraryJobMock = vi.fn();
const searchAllSourcesMock = vi.fn();
const getDecryptedApiKeyMock = vi.fn();

vi.mock("@bookhouse/db", () => ({
  db: {
    importJob: { create: importJobCreateMock },
    work: {
      update: workUpdateMock,
      findUnique: workFindUniqueMock,
    },
    edition: {
      update: editionUpdateMock,
      findUnique: editionFindUniqueMock,
      findMany: editionFindManyMock,
    },
    externalLink: {
      upsert: externalLinkUpsertMock,
      findMany: externalLinkFindManyMock,
    },
    tag: {
      findFirst: tagFindFirstMock,
      create: tagCreateMock,
    },
    workTag: {
      upsert: workTagUpsertMock,
    },
    contributor: {
      findFirst: contributorFindFirstMock,
      create: contributorCreateMock,
    },
    editionContributor: {
      deleteMany: editionContributorDeleteManyMock,
      createMany: editionContributorCreateManyMock,
    },
  },
}));

vi.mock("@bookhouse/shared", () => ({
  enqueueLibraryJob: enqueueLibraryJobMock,
}));

const applyCoverFromUrlMock = vi.fn();

vi.mock("@bookhouse/ingest", () => {
  class MockRateLimiter {
    check(): { allowed: boolean } {
      return { allowed: true };
    }
  }
  return {
    searchAllSources: searchAllSourcesMock,
    searchOpenLibrary: vi.fn(),
    getOpenLibraryWork: vi.fn(),
    getOpenLibraryEdition: vi.fn(),
    searchGoogleBooks: vi.fn(),
    searchHardcover: vi.fn(),
    RateLimiter: MockRateLimiter,
    applyCoverFromUrl: applyCoverFromUrlMock,
    resizeCoverImage: vi.fn(),
    extractDominantColors: vi.fn(),
    canonicalizeContributorName: (name: string): string | null => name === "UNKNOWN" ? null : name.toLowerCase(),
    createOLFetcher: () => fetch,
  };
});

vi.mock("./integrations", () => ({
  getDecryptedApiKey: getDecryptedApiKeyMock,
}));

import {
  triggerEnrichmentServerFn,
  getEnrichmentDataServerFn,
  applyEnrichmentServerFn,
  applyCoverFromUrlServerFn,
  searchEnrichmentServerFn,
  buildSearchDeps,
} from "./enrichment";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSearchDeps", () => {
  const fakeFetcher = vi.fn() as typeof fetch;
  const fns = {
    searchOpenLibrary: vi.fn().mockResolvedValue([]),
    getOpenLibraryWork: vi.fn().mockResolvedValue(null),
    getOpenLibraryEdition: vi.fn().mockResolvedValue(null),
    searchGoogleBooks: vi.fn().mockResolvedValue([]),
    searchHardcover: vi.fn().mockResolvedValue([]),
  };
  const rateLimiter = { check: () => ({ allowed: true }) };

  it("wires OL functions through to deps", async () => {
    const deps = buildSearchDeps(null, null, rateLimiter, fakeFetcher, fns);

    await deps.searchOL("Dune", "Herbert");
    await deps.getOLWork("OL123W");

    expect(fns.searchOpenLibrary).toHaveBeenCalledWith("Dune", "Herbert", fakeFetcher);
    expect(fns.getOpenLibraryWork).toHaveBeenCalledWith("OL123W", fakeFetcher);
  });

  it("wires OL edition function through to deps", async () => {
    const deps = buildSearchDeps(null, null, rateLimiter, fakeFetcher, fns);

    await deps.getOLEdition("9780441172719");

    expect(fns.getOpenLibraryEdition).toHaveBeenCalledWith("9780441172719", fakeFetcher);
  });

  it("returns null for GB when no key", async () => {
    const deps = buildSearchDeps(null, null, rateLimiter, fakeFetcher, fns);

    const result = await deps.searchGB("Dune", undefined);

    expect(result).toBeNull();
    expect(fns.searchGoogleBooks).not.toHaveBeenCalled();
  });

  it("calls GB with key when provided", async () => {
    const deps = buildSearchDeps("gb-key", null, rateLimiter, fakeFetcher, fns);

    await deps.searchGB("Dune", "Herbert");

    expect(fns.searchGoogleBooks).toHaveBeenCalledWith("Dune", "Herbert", "gb-key", fakeFetcher);
  });

  it("returns null for HC when no key", async () => {
    const deps = buildSearchDeps(null, null, rateLimiter, fakeFetcher, fns);

    const result = await deps.searchHC("Dune", undefined);

    expect(result).toBeNull();
    expect(fns.searchHardcover).not.toHaveBeenCalled();
  });

  it("calls HC with key when provided", async () => {
    const deps = buildSearchDeps(null, "hc-key", rateLimiter, fakeFetcher, fns);

    await deps.searchHC("Dune", "Herbert");

    expect(fns.searchHardcover).toHaveBeenCalledWith("Dune", "Herbert", "hc-key", fakeFetcher);
  });

  it("delegates checkRateLimit to rateLimiter", () => {
    const deps = buildSearchDeps(null, null, rateLimiter, fakeFetcher, fns);

    const result = deps.checkRateLimit();

    expect(result).toEqual({ allowed: true });
  });
});

describe("triggerEnrichmentServerFn", () => {
  it("creates an import job and enqueues a refresh-metadata job", async () => {
    importJobCreateMock.mockResolvedValue({ id: "ij-1" });
    enqueueLibraryJobMock.mockResolvedValue("job-1");

    const result = await triggerEnrichmentServerFn({
      data: { workId: "w1" },
    });

    expect(importJobCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "REFRESH_METADATA",
        status: "QUEUED",
        payload: { workId: "w1" },
      },
    });
    expect(enqueueLibraryJobMock).toHaveBeenCalledWith("refresh-metadata", {
      workId: "w1",
      importJobId: "ij-1",
    });
    expect(result).toEqual({ importJobId: "ij-1", queueJobId: "job-1" });
  });
});

describe("searchEnrichmentServerFn", () => {
  it("searches all sources and returns results", async () => {
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      titleDisplay: "Dune",
      editions: [{
        id: "e1",
        contributors: [{ contributor: { nameDisplay: "Frank Herbert" } }],
      }],
    });
    getDecryptedApiKeyMock.mockResolvedValue(null);
    searchAllSourcesMock.mockResolvedValue({
      status: "success",
      results: [{ provider: "openlibrary", externalId: "OL123W", work: {}, edition: {} }],
    });

    const result = await searchEnrichmentServerFn({ data: { workId: "w1" } }) as { status: string };

    expect(result.status).toBe("success");
    expect(searchAllSourcesMock).toHaveBeenCalled();
  });

  it("returns not-found when work does not exist", async () => {
    workFindUniqueMock.mockResolvedValue(null);

    const result = await searchEnrichmentServerFn({ data: { workId: "missing" } }) as { status: string };

    expect(result).toEqual({ status: "not-found" });
  });

  it("passes API keys to the deps when configured", async () => {
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      titleDisplay: "Dune",
      editions: [{ id: "e1", contributors: [] }],
    });
    getDecryptedApiKeyMock.mockImplementation((provider: string) => {
      if (provider === "googlebooks") return Promise.resolve("gb-key");
      if (provider === "hardcover") return Promise.resolve("hc-key");
      return Promise.resolve(null);
    });
    searchAllSourcesMock.mockResolvedValue({ status: "no-results" });

    await searchEnrichmentServerFn({ data: { workId: "w1" } });

    expect(searchAllSourcesMock).toHaveBeenCalledTimes(1);
  });

  it("returns no-editions when work has no editions", async () => {
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      titleDisplay: "Dune",
      editions: [],
    });

    const result = await searchEnrichmentServerFn({ data: { workId: "w1" } }) as { status: string };

    expect(result).toEqual({ status: "no-editions" });
  });
});

describe("getEnrichmentDataServerFn", () => {
  it("returns external links for the work (both edition and work level)", async () => {
    const allLinks = [
      { id: "el1", provider: "openlibrary", externalId: "OL123W" },
      { id: "el2", provider: "googlebooks", externalId: "gb_abc" },
    ];
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      editions: [{ id: "e1" }],
    });
    externalLinkFindManyMock.mockResolvedValue(allLinks);

    const result = await getEnrichmentDataServerFn({ data: { workId: "w1" } });

    expect(result).toEqual({ externalLinks: allLinks });
    expect(externalLinkFindManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { workId: "w1" },
          { editionId: { in: ["e1"] } },
        ],
      },
    });
  });

  it("returns external links when work has no editions", async () => {
    workFindUniqueMock.mockResolvedValue({
      id: "w1",
      editions: [],
    });
    externalLinkFindManyMock.mockResolvedValue([]);

    const result = await getEnrichmentDataServerFn({ data: { workId: "w1" } });

    expect(result).toEqual({ externalLinks: [] });
    expect(externalLinkFindManyMock).toHaveBeenCalledWith({
      where: { OR: [{ workId: "w1" }] },
    });
  });

  it("returns empty array when work is not found", async () => {
    workFindUniqueMock.mockResolvedValue(null);

    const result = await getEnrichmentDataServerFn({ data: { workId: "w1" } });

    expect(result).toEqual({ externalLinks: [] });
  });
});

describe("applyEnrichmentServerFn", () => {
  it("applies work-level fields and creates provenance record", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "A hobbit adventure" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { description: "A hobbit adventure" },
    });
    expect(externalLinkUpsertMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("sets enrichmentStatus to ENRICHED when fields are applied", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "A hobbit adventure" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Should have a second work.update call setting enrichmentStatus
    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { enrichmentStatus: "ENRICHED" },
    });
  });

  it("does not set enrichmentStatus when all fields are skipped", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description"] });
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "New desc" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // workUpdateMock should not have been called at all (field was filtered by editedFields)
    expect(workUpdateMock).not.toHaveBeenCalled();
  });

  it("applies edition-level fields", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        editionId: "e1",
        editionFields: { publisher: "Penguin" },
        source: { provider: "googlebooks", externalId: "gb_abc" },
      },
    });

    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { publisher: "Penguin" },
    });
    expect(result).toEqual({ success: true });
  });

  it("maps publishedDate to publishedAt as Date for edition update", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        editionId: "e1",
        editionFields: { publishedDate: "2007-04-01" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    const callArgs = editionUpdateMock.mock.calls[0]?.[0] as { data: Record<string, string | number | boolean | null | object> };
    expect(callArgs.data.publishedAt).toBeInstanceOf(Date);
    expect(callArgs.data.publishedDate).toBeUndefined();
  });

  it("maps null publishedDate to null publishedAt", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    editionUpdateMock.mockResolvedValue({ id: "e1" });
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        editionId: "e1",
        editionFields: { publishedDate: null },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    const callArgs = editionUpdateMock.mock.calls[0]?.[0] as { data: Record<string, string | number | boolean | null | object> };
    expect(callArgs.data.publishedAt).toBeNull();
  });

  it("applies both work and edition fields", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    editionUpdateMock.mockResolvedValue({ id: "e1" });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        editionId: "e1",
        workFields: { description: "Desc" },
        editionFields: { publisher: "Penguin" },
        source: { provider: "hardcover", externalId: "hc_42" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalled();
    expect(editionUpdateMock).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("skips work fields that were manually edited", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: ["description"] });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "New desc" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(workUpdateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("skips edition fields that were manually edited", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindUniqueMock.mockResolvedValue({ id: "e1", editedFields: ["publisher"] });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        editionId: "e1",
        editionFields: { publisher: "Penguin" },
        source: { provider: "googlebooks", externalId: "gb_abc" },
      },
    });

    expect(editionUpdateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("handles edition not found gracefully for editedFields", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindUniqueMock.mockResolvedValue(null);
    editionUpdateMock.mockResolvedValue({ id: "e1" });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        editionId: "e1",
        editionFields: { publisher: "Penguin" },
        source: { provider: "googlebooks", externalId: "gb_abc" },
      },
    });

    expect(editionUpdateMock).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { publisher: "Penguin" },
    });
    expect(result).toEqual({ success: true });
  });

  it("applies subjects as tags via tag upsert", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    tagFindFirstMock.mockResolvedValueOnce({ id: "tag-1", name: "Science Fiction" });
    tagFindFirstMock.mockResolvedValueOnce(null);
    tagCreateMock.mockResolvedValueOnce({ id: "tag-2", name: "Epic" });
    workTagUpsertMock.mockResolvedValue({});
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { subjects: ["Science Fiction", "Epic"] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(tagFindFirstMock).toHaveBeenCalledTimes(2);
    expect(tagCreateMock).toHaveBeenCalledTimes(1);
    expect(workTagUpsertMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });

  it("skips empty strings in subjects array", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    tagFindFirstMock.mockResolvedValueOnce({ id: "tag-1", name: "Fantasy" });
    workTagUpsertMock.mockResolvedValue({});
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { subjects: ["Fantasy", "", "  "] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Only "Fantasy" should be processed; "" and "  " are trimmed and skipped
    expect(tagFindFirstMock).toHaveBeenCalledTimes(1);
    expect(workTagUpsertMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it("applies authors via contributor resolution and edition contributor creation", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindManyMock.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    contributorFindFirstMock.mockResolvedValueOnce({ id: "c1", nameDisplay: "Frank Herbert" });
    contributorFindFirstMock.mockResolvedValueOnce(null);
    contributorCreateMock.mockResolvedValueOnce({ id: "c2", nameDisplay: "Brian Herbert" });
    editionContributorDeleteManyMock.mockResolvedValue({});
    editionContributorCreateManyMock.mockResolvedValue({});
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { authors: ["Frank Herbert", "Brian Herbert"] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(contributorFindFirstMock).toHaveBeenCalledTimes(2);
    expect(contributorCreateMock).toHaveBeenCalledTimes(1);
    expect(editionContributorDeleteManyMock).toHaveBeenCalledWith({
      where: { editionId: { in: ["e1", "e2"] }, role: "AUTHOR" },
    });
    expect(editionContributorCreateManyMock).toHaveBeenCalledWith({
      data: [
        { editionId: "e1", contributorId: "c1", role: "AUTHOR" },
        { editionId: "e1", contributorId: "c2", role: "AUTHOR" },
        { editionId: "e2", contributorId: "c1", role: "AUTHOR" },
        { editionId: "e2", contributorId: "c2", role: "AUTHOR" },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ success: true });
  });

  it("falls back to lowercase when canonicalizeContributorName returns null", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
    contributorFindFirstMock.mockResolvedValueOnce(null);
    contributorCreateMock.mockResolvedValueOnce({ id: "c1", nameDisplay: "UNKNOWN" });
    editionContributorDeleteManyMock.mockResolvedValue({});
    editionContributorCreateManyMock.mockResolvedValue({});
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { authors: ["UNKNOWN"] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // canonicalizeContributorName("UNKNOWN") returns null, so fallback to "unknown"
    expect(contributorFindFirstMock).toHaveBeenCalledWith({ where: { nameCanonical: "unknown" } });
    expect(contributorCreateMock).toHaveBeenCalledWith({
      data: { nameDisplay: "UNKNOWN", nameCanonical: "unknown" },
    });
  });

  it("skips empty author names in authors array", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    editionFindManyMock.mockResolvedValue([{ id: "e1" }]);
    contributorFindFirstMock.mockResolvedValueOnce({ id: "c1", nameDisplay: "Frank Herbert" });
    editionContributorDeleteManyMock.mockResolvedValue({});
    editionContributorCreateManyMock.mockResolvedValue({});
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { authors: ["Frank Herbert", "", "  "] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Only "Frank Herbert" should be resolved; "" and "  " are trimmed and skipped
    expect(contributorFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it("maps title to titleDisplay in work update", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { title: "The Name of the Wind: Anniversary Edition" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { titleDisplay: "The Name of the Wind: Anniversary Edition" },
    });
  });

  it("strips coverUrl from workFields before applying", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    externalLinkUpsertMock.mockResolvedValue({});

    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "New desc", coverUrl: "https://example.com/cover.jpg" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { description: "New desc" },
    });
  });

  it("returns skippedAll when no fields provided", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(result).toEqual({ success: true, skippedAll: true });
  });

  it("handles work not found gracefully for editedFields", async () => {
    workFindUniqueMock.mockResolvedValue(null);
    workUpdateMock.mockResolvedValue({ id: "w1" });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "Desc" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(workUpdateMock).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { description: "Desc" },
    });
    expect(result).toEqual({ success: true });
  });

  it("external link upsert is idempotent — second apply with same source uses upsert", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    workUpdateMock.mockResolvedValue({ id: "w1" });
    externalLinkUpsertMock.mockResolvedValue({});

    // First apply
    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "First desc" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Second apply with same source
    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { description: "Second desc" },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Both calls should use upsert (not create), preventing duplicates
    expect(externalLinkUpsertMock).toHaveBeenCalledTimes(2);
    for (const call of externalLinkUpsertMock.mock.calls as Array<Array<object>>) {
      const arg = call[0] as { where: { workId_provider_externalId: Record<string, string> } };
      expect(arg.where.workId_provider_externalId).toEqual({
        workId: "w1",
        provider: "openlibrary",
        externalId: "OL123W",
      });
    }
  });

  it("applying same subjects twice uses workTag upsert to avoid duplicates", async () => {
    workFindUniqueMock.mockResolvedValue({ id: "w1", editedFields: [] });
    tagFindFirstMock.mockResolvedValue({ id: "tag-1", name: "Fantasy" });
    workTagUpsertMock.mockResolvedValue({});
    externalLinkUpsertMock.mockResolvedValue({});

    // First apply
    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { subjects: ["Fantasy"] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Second apply with same subjects
    await applyEnrichmentServerFn({
      data: {
        workId: "w1",
        workFields: { subjects: ["Fantasy"] },
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    // Both calls should use upsert, not create — no duplicate workTags
    expect(workTagUpsertMock).toHaveBeenCalledTimes(2);
    for (const call of workTagUpsertMock.mock.calls as Array<Array<object>>) {
      const arg = call[0] as { where: { workId_tagId: { workId: string; tagId: string } } };
      expect(arg.where.workId_tagId.workId).toBe("w1");
      expect(arg.where.workId_tagId.tagId).toBe("tag-1");
    }
    // tag.create should not have been called — existing tag found both times
    expect(tagCreateMock).not.toHaveBeenCalled();
  });
});

describe("applyCoverFromUrlServerFn", () => {
  it("calls applyCoverFromUrl and returns success", async () => {
    applyCoverFromUrlMock.mockResolvedValue({ success: true });

    const result = await applyCoverFromUrlServerFn({
      data: {
        workId: "w1",
        imageUrl: "https://example.com/cover.jpg",
      },
    });

    expect(applyCoverFromUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ workId: "w1", imageUrl: "https://example.com/cover.jpg" }) as object,
      expect.any(Object) as object,
      expect.any(Object) as object,
    );
    expect(result).toEqual({ success: true });
  });

  it("creates externalLink provenance when source is provided", async () => {
    applyCoverFromUrlMock.mockResolvedValue({ success: true });
    externalLinkUpsertMock.mockResolvedValue({});

    const result = await applyCoverFromUrlServerFn({
      data: {
        workId: "w1",
        imageUrl: "https://example.com/cover.jpg",
        source: { provider: "openlibrary", externalId: "OL123W" },
      },
    });

    expect(externalLinkUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workId_provider_externalId: {
            workId: "w1",
            provider: "openlibrary",
            externalId: "OL123W",
          },
        },
      }) as object,
    );
    expect(result).toEqual({ success: true });
  });

  it("does not create externalLink when source is omitted", async () => {
    applyCoverFromUrlMock.mockResolvedValue({ success: true });

    await applyCoverFromUrlServerFn({
      data: {
        workId: "w1",
        imageUrl: "https://example.com/cover.jpg",
      },
    });

    expect(externalLinkUpsertMock).not.toHaveBeenCalled();
  });

  it("propagates errors from applyCoverFromUrl", async () => {
    applyCoverFromUrlMock.mockRejectedValue(new Error("Image too large (max 10 MB)"));

    await expect(
      applyCoverFromUrlServerFn({
        data: {
          workId: "w1",
          imageUrl: "https://example.com/huge.jpg",
        },
      }),
    ).rejects.toThrow("Image too large (max 10 MB)");
  });
});
