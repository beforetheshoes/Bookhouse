import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichContributor, type EnrichContributorDeps } from "./enrich-contributor";

function createMockDeps(overrides: Partial<EnrichContributorDeps> = {}): EnrichContributorDeps {
  return {
    findContributor: vi.fn().mockResolvedValue({ id: "c1", nameDisplay: "J.R.R. Tolkien", imagePath: null }),
    acquireOLToken: vi.fn().mockResolvedValue(undefined),
    searchOLAuthors: vi.fn().mockResolvedValue([{ olid: "OL34184A", name: "J.R.R. Tolkien", workCount: 200 }]),
    applyPhoto: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("enrichContributor", () => {
  let deps: EnrichContributorDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("acquires OL token, searches, and applies photo", async () => {
    const result = await enrichContributor("c1", deps);

    expect(deps.acquireOLToken).toHaveBeenCalledTimes(2); // once for search, once for photo fetch
    expect(deps.searchOLAuthors).toHaveBeenCalledWith("J.R.R. Tolkien");
    expect(deps.applyPhoto).toHaveBeenCalledWith(
      "c1",
      "https://covers.openlibrary.org/a/olid/OL34184A-M.jpg",
    );
    expect(result).toEqual({ status: "enriched", authorOlid: "OL34184A" });
  });

  it("returns not-found when contributor does not exist", async () => {
    deps = createMockDeps({
      findContributor: vi.fn().mockResolvedValue(null),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "not-found" });
    expect(deps.acquireOLToken).not.toHaveBeenCalled();
  });

  it("returns already-has-image when contributor already has imagePath", async () => {
    deps = createMockDeps({
      findContributor: vi.fn().mockResolvedValue({ id: "c1", nameDisplay: "Tolkien", imagePath: "c1" }),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "already-has-image" });
    expect(deps.acquireOLToken).not.toHaveBeenCalled();
  });

  it("falls back to Hardcover when OL has no results", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockResolvedValue([
        { hardcoverId: "100", name: "J.R.R. Tolkien", imageUrl: "https://hardcover.app/authors/tolkien.jpg" },
      ]),
    });

    const result = await enrichContributor("c1", deps);

    expect(deps.acquireHCToken).toHaveBeenCalledTimes(1);
    expect(deps.searchHCAuthors).toHaveBeenCalledWith("J.R.R. Tolkien");
    expect(deps.applyPhoto).toHaveBeenCalledWith("c1", "https://hardcover.app/authors/tolkien.jpg");
    expect(result).toEqual({ status: "enriched", authorOlid: "hc:100" });
  });

  it("falls back to Hardcover when OL photo is a placeholder", async () => {
    deps = createMockDeps({
      applyPhoto: vi.fn()
        .mockRejectedValueOnce(new Error("Image too small (likely a placeholder)"))
        .mockResolvedValueOnce({ success: true }),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockResolvedValue([
        { hardcoverId: "100", name: "J.R.R. Tolkien", imageUrl: "https://hardcover.app/tolkien.jpg" },
      ]),
    });

    const result = await enrichContributor("c1", deps);

    expect(deps.applyPhoto).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: "enriched", authorOlid: "hc:100" });
  });

  it("returns no-results when both OL and HC have no results", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockResolvedValue([]),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-results", triedSources: ["openlibrary", "hardcover"] });
  });

  it("returns no-photo when HC photo is also invalid", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockResolvedValue([
        { hardcoverId: "100", name: "Author", imageUrl: "https://hardcover.app/photo.jpg" },
      ]),
      applyPhoto: vi.fn().mockRejectedValue(new Error("Image too small (likely a placeholder)")),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-photo", triedSources: ["openlibrary", "hardcover"] });
  });

  it("returns no-photo when HC author has no image URL", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockResolvedValue([
        { hardcoverId: "100", name: "Unknown", imageUrl: null },
      ]),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-photo", triedSources: ["openlibrary", "hardcover"] });
  });

  it("skips HC fallback when HC is not configured", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      // no acquireHCToken or searchHCAuthors
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-results", triedSources: ["openlibrary"] });
  });

  it("returns no-results when OL returns null", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue(null),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-results", triedSources: ["openlibrary"] });
  });

  it("returns no-photo when OL photo is invalid and HC is not configured", async () => {
    deps = createMockDeps({
      applyPhoto: vi.fn().mockRejectedValue(new Error("Image too small (likely a placeholder)")),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-photo", triedSources: ["openlibrary"] });
  });

  it("falls back to Wikidata when OL and HC have no photo", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockResolvedValue([]),
      acquireWDToken: vi.fn().mockResolvedValue(undefined),
      searchWDAuthors: vi.fn().mockResolvedValue([
        { qid: "Q2427544", name: "N. K. Jemisin", imageUrl: "https://upload.wikimedia.org/photo.jpg" },
      ]),
    });

    const result = await enrichContributor("c1", deps);

    expect(deps.acquireWDToken).toHaveBeenCalled();
    expect(result).toEqual({ status: "enriched", authorOlid: "wd:Q2427544" });
  });

  it("returns no-photo when Wikidata photo is invalid", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireWDToken: vi.fn().mockResolvedValue(undefined),
      searchWDAuthors: vi.fn().mockResolvedValue([
        { qid: "Q99", name: "Author", imageUrl: "https://upload.wikimedia.org/bad.jpg" },
      ]),
      applyPhoto: vi.fn().mockRejectedValue(new Error("Image too small (likely a placeholder)")),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-photo", triedSources: ["wikidata", "openlibrary"] });
  });

  it("skips Wikidata results without imageUrl", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireWDToken: vi.fn().mockResolvedValue(undefined),
      searchWDAuthors: vi.fn().mockResolvedValue([
        { qid: "Q1", name: "No Photo", imageUrl: null },
        { qid: "Q2", name: "Has Photo", imageUrl: "https://upload.wikimedia.org/photo.jpg" },
      ]),
    });

    const result = await enrichContributor("c1", deps);

    expect(deps.applyPhoto).toHaveBeenCalledWith("c1", "https://upload.wikimedia.org/photo.jpg");
    expect(result).toEqual({ status: "enriched", authorOlid: "wd:Q2" });
  });

  it("returns no-results when all sources find nothing", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireWDToken: vi.fn().mockResolvedValue(undefined),
      searchWDAuthors: vi.fn().mockResolvedValue([]),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "no-results", triedSources: ["wikidata", "openlibrary"] });
  });

  it("catches Wikidata errors and continues to OL", async () => {
    deps = createMockDeps({
      acquireWDToken: vi.fn().mockResolvedValue(undefined),
      searchWDAuthors: vi.fn().mockRejectedValue(new Error("Wikidata API error: 429")),
    });

    const result = await enrichContributor("c1", deps);

    expect(result).toEqual({ status: "enriched", authorOlid: "OL34184A" });
  });

  it("catches Hardcover errors and continues gracefully", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockResolvedValue([]),
      acquireHCToken: vi.fn().mockResolvedValue(undefined),
      searchHCAuthors: vi.fn().mockRejectedValue(new Error("Hardcover API error")),
      acquireWDToken: vi.fn().mockResolvedValue(undefined),
      searchWDAuthors: vi.fn().mockResolvedValue([]),
    });

    const result = await enrichContributor("c1", deps);

    expect(result.status).toBe("no-results");
    if (result.status === "no-results") {
      expect(result.triedSources).toContain("hardcover");
    }
  });

  it("propagates OL search errors so BullMQ retries the job", async () => {
    deps = createMockDeps({
      searchOLAuthors: vi.fn().mockRejectedValue(new Error("Open Library API error: 500")),
    });

    await expect(enrichContributor("c1", deps)).rejects.toThrow("Open Library API error: 500");
  });

  it("propagates applyPhoto network errors so BullMQ retries the job", async () => {
    deps = createMockDeps({
      applyPhoto: vi.fn().mockRejectedValue(new Error("fetch failed")),
    });

    await expect(enrichContributor("c1", deps)).rejects.toThrow("fetch failed");
  });

  it("propagates non-Error throws from applyPhoto", async () => {
    deps = createMockDeps({
      applyPhoto: vi.fn().mockRejectedValue("string error"),
    });

    await expect(enrichContributor("c1", deps)).rejects.toBe("string error");
  });
});
