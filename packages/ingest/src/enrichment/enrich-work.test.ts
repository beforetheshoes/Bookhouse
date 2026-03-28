import { describe, it, expect, vi } from "vitest";
import { enrichWork, type EnrichWorkDeps } from "./enrich-work";
import type { OLSearchResult, OLWork } from "./open-library";

function makeDeps(overrides: Partial<EnrichWorkDeps> = {}): EnrichWorkDeps {
  return {
    findWork: vi.fn().mockResolvedValue({
      id: "w1",
      titleDisplay: "The Hobbit",
      editions: [
        {
          id: "e1",
          isbn13: "9780547928227",
          isbn10: null,
          contributors: [{ contributor: { nameDisplay: "J.R.R. Tolkien" } }],
          externalLinks: [],
        },
      ],
    }),
    searchOL: vi.fn().mockResolvedValue([
      {
        olid: "OL123W",
        title: "The Hobbit",
        authors: ["J.R.R. Tolkien"],
        firstPublishYear: 1937,
        isbns: [],
        coverId: 42,
      } satisfies OLSearchResult,
    ]),
    getOLWork: vi.fn().mockResolvedValue({
      olid: "OL123W",
      title: "The Hobbit",
      description: "A hobbit goes on an adventure",
      coverIds: [42],
      subjects: ["Fantasy"],
    } satisfies OLWork),
    upsertExternalLink: vi.fn().mockResolvedValue({ id: "el1" }),
    acquireOLToken: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("enrichWork", () => {
  it("searches OL and stores result as external link", async () => {
    const deps = makeDeps();
    const result = await enrichWork("w1", deps);

    expect(deps.findWork).toHaveBeenCalledWith("w1");
    expect(deps.searchOL).toHaveBeenCalledWith("The Hobbit", "J.R.R. Tolkien");
    expect(deps.getOLWork).toHaveBeenCalledWith("OL123W");
    expect(deps.upsertExternalLink).toHaveBeenCalledWith({
      editionId: "e1",
      provider: "openlibrary",
      externalId: "OL123W",
      metadata: {
        title: "The Hobbit",
        description: "A hobbit goes on an adventure",
        coverIds: [42],
        subjects: ["Fantasy"],
        firstPublishYear: 1937,
        coverId: 42,
      },
    });
    expect(result).toEqual({ status: "enriched", workOlid: "OL123W" });
  });

  it("returns not-found when work does not exist", async () => {
    const deps = makeDeps({ findWork: vi.fn().mockResolvedValue(null) });
    const result = await enrichWork("w1", deps);
    expect(result).toEqual({ status: "not-found" });
    expect(deps.searchOL).not.toHaveBeenCalled();
  });

  it("returns no-results when OL search returns empty", async () => {
    const deps = makeDeps({ searchOL: vi.fn().mockResolvedValue([]) });
    const result = await enrichWork("w1", deps);
    expect(result).toEqual({ status: "no-results" });
    expect(deps.upsertExternalLink).not.toHaveBeenCalled();
  });

  it("returns no-results when OL search returns null", async () => {
    const deps = makeDeps({ searchOL: vi.fn().mockResolvedValue(null) });
    const result = await enrichWork("w1", deps);
    expect(result).toEqual({ status: "no-results" });
  });

  it("calls acquireOLToken before making API calls", async () => {
    const deps = makeDeps();
    await enrichWork("w1", deps);
    expect(deps.acquireOLToken).toHaveBeenCalled();
  });

  it("uses first author from first edition for search", async () => {
    const deps = makeDeps({
      findWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Book",
        editions: [
          {
            id: "e1",
            isbn13: null,
            isbn10: null,
            contributors: [
              { contributor: { nameDisplay: "Author A" } },
              { contributor: { nameDisplay: "Author B" } },
            ],
            externalLinks: [],
          },
        ],
      }),
    });
    await enrichWork("w1", deps);
    expect(deps.searchOL).toHaveBeenCalledWith("Book", "Author A");
  });

  it("passes undefined author when no contributors exist", async () => {
    const deps = makeDeps({
      findWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Orphan Book",
        editions: [
          {
            id: "e1",
            isbn13: null,
            isbn10: null,
            contributors: [],
            externalLinks: [],
          },
        ],
      }),
    });
    await enrichWork("w1", deps);
    expect(deps.searchOL).toHaveBeenCalledWith("Orphan Book", undefined);
  });

  it("skips enrichment for editions that already have an openlibrary link", async () => {
    const deps = makeDeps({
      findWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "Already Done",
        editions: [
          {
            id: "e1",
            isbn13: null,
            isbn10: null,
            contributors: [],
            externalLinks: [{ provider: "openlibrary", externalId: "OL999W" }],
          },
        ],
      }),
    });
    const result = await enrichWork("w1", deps);
    expect(result).toEqual({ status: "already-enriched" });
    expect(deps.searchOL).not.toHaveBeenCalled();
  });

  it("handles work with no editions", async () => {
    const deps = makeDeps({
      findWork: vi.fn().mockResolvedValue({
        id: "w1",
        titleDisplay: "No Editions",
        editions: [],
      }),
    });
    const result = await enrichWork("w1", deps);
    expect(result).toEqual({ status: "no-editions" });
  });

  it("stores metadata even when getOLWork returns null", async () => {
    const deps = makeDeps({
      getOLWork: vi.fn().mockResolvedValue(null),
    });
    const result = await enrichWork("w1", deps);
    expect(result).toEqual({ status: "enriched", workOlid: "OL123W" });
    expect(deps.upsertExternalLink).toHaveBeenCalledWith({
      editionId: "e1",
      provider: "openlibrary",
      externalId: "OL123W",
      metadata: {
        title: "The Hobbit",
        description: null,
        coverIds: [],
        subjects: [],
        firstPublishYear: 1937,
        coverId: 42,
      },
    });
  });
});
