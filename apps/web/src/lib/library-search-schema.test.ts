import { describe, it, expect } from "vitest";
import { librarySearchSchema } from "./library-search-schema";

describe("librarySearchSchema", () => {
  it("returns defaults for empty input", () => {
    const result = librarySearchSchema.parse({});
    expect(result).toEqual({
      page: 1,
      pageSize: 50,
      sort: "title-asc",
      view: "works",
    });
  });

  it("parses page and pageSize", () => {
    const result = librarySearchSchema.parse({ page: 2, pageSize: 25 });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(25);
  });

  it("parses sort option", () => {
    const result = librarySearchSchema.parse({ sort: "title-desc" });
    expect(result.sort).toBe("title-desc");
  });

  it("parses text query", () => {
    const result = librarySearchSchema.parse({ q: "hobbit" });
    expect(result.q).toBe("hobbit");
  });

  it("parses format array", () => {
    const result = librarySearchSchema.parse({ format: ["EBOOK"] });
    expect(result.format).toEqual(["EBOOK"]);
  });

  it("parses single format as string into array", () => {
    const result = librarySearchSchema.parse({ format: "EBOOK" });
    expect(result.format).toEqual(["EBOOK"]);
  });

  it("parses authorId array", () => {
    const result = librarySearchSchema.parse({ authorId: ["a1", "a2"] });
    expect(result.authorId).toEqual(["a1", "a2"]);
  });

  it("parses single authorId as string into array", () => {
    const result = librarySearchSchema.parse({ authorId: "a1" });
    expect(result.authorId).toEqual(["a1"]);
  });

  it("parses seriesId array", () => {
    const result = librarySearchSchema.parse({ seriesId: ["s1"] });
    expect(result.seriesId).toEqual(["s1"]);
  });

  it("parses single seriesId as string into array", () => {
    const result = librarySearchSchema.parse({ seriesId: "s1" });
    expect(result.seriesId).toEqual(["s1"]);
  });

  it("parses hasCover boolean", () => {
    expect(librarySearchSchema.parse({ hasCover: true }).hasCover).toBe(true);
    expect(librarySearchSchema.parse({ hasCover: false }).hasCover).toBe(false);
  });

  it("parses hasCover string 'true'/'false' from URL params", () => {
    expect(librarySearchSchema.parse({ hasCover: "true" }).hasCover).toBe(true);
    expect(librarySearchSchema.parse({ hasCover: "false" }).hasCover).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = librarySearchSchema.parse({ unknown: "value", page: 1 });
    expect(result).not.toHaveProperty("unknown");
  });

  it("rejects page less than 1", () => {
    expect(() => librarySearchSchema.parse({ page: 0 })).toThrow();
  });

  it("rejects invalid sort values", () => {
    expect(() => librarySearchSchema.parse({ sort: "invalid" })).toThrow();
  });

  it("rejects invalid format values", () => {
    expect(() => librarySearchSchema.parse({ format: ["INVALID"] })).toThrow();
  });

  it("defaults view to works", () => {
    const result = librarySearchSchema.parse({});
    expect(result.view).toBe("works");
  });

  it("parses view=editions", () => {
    const result = librarySearchSchema.parse({ view: "editions" });
    expect(result.view).toBe("editions");
  });

  it("rejects invalid view values", () => {
    expect(() => librarySearchSchema.parse({ view: "invalid" })).toThrow();
  });

  it.each([
    "publisher-asc", "publisher-desc",
    "publishDate-asc", "publishDate-desc",
    "pageCount-asc", "pageCount-desc",
    "duration-asc", "duration-desc",
    "narrator-asc", "narrator-desc",
    "isbn13-asc", "isbn13-desc",
    "isbn10-asc", "isbn10-desc",
    "asin-asc", "asin-desc",
  ])("parses edition sort value %s", (sort) => {
    const result = librarySearchSchema.parse({ sort });
    expect(result.sort).toBe(sort);
  });
});
