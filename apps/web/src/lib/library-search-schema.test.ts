import { describe, it, expect } from "vitest";
import { librarySearchSchema } from "./library-search-schema";

describe("librarySearchSchema", () => {
  it("returns defaults for empty input", () => {
    const result = librarySearchSchema.parse({});
    expect(result).toEqual({
      page: 1,
      pageSize: 50,
      sort: "title-asc",
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

  it("parses publisher array", () => {
    const result = librarySearchSchema.parse({ publisher: ["Penguin"] });
    expect(result.publisher).toEqual(["Penguin"]);
  });

  it("parses single publisher as string into array", () => {
    const result = librarySearchSchema.parse({ publisher: "Penguin" });
    expect(result.publisher).toEqual(["Penguin"]);
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

  it("parses author-asc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "author-asc" }).sort).toBe("author-asc");
  });

  it("parses author-desc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "author-desc" }).sort).toBe("author-desc");
  });

  it("parses publisher-asc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "publisher-asc" }).sort).toBe("publisher-asc");
  });

  it("parses publisher-desc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "publisher-desc" }).sort).toBe("publisher-desc");
  });

  it("parses format-asc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "format-asc" }).sort).toBe("format-asc");
  });

  it("parses format-desc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "format-desc" }).sort).toBe("format-desc");
  });

  it("parses isbn-asc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "isbn-asc" }).sort).toBe("isbn-asc");
  });

  it("parses isbn-desc sort option", () => {
    expect(librarySearchSchema.parse({ sort: "isbn-desc" }).sort).toBe("isbn-desc");
  });

  it("rejects invalid sort values", () => {
    expect(() => librarySearchSchema.parse({ sort: "invalid" })).toThrow();
  });

  it("rejects invalid format values", () => {
    expect(() => librarySearchSchema.parse({ format: ["INVALID"] })).toThrow();
  });
});
