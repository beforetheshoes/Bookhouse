import { describe, it, expect } from "vitest";
import { sortAndFilterWorks, type ReadingFilter } from "./sort-filter-works";

interface MockWork {
  id: string;
  titleDisplay: string;
  titleCanonical: string;
  sortTitle: string | null;
  createdAt: Date;
  editions: {
    formatFamily: string;
    contributors: { role: string; contributor: { nameDisplay: string } }[];
  }[];
  [key: string]: string | number | boolean | null | object;
}

const makeWork = (
  title: string,
  authors: string[] = [],
  createdAt = new Date("2025-01-01"),
): MockWork => ({
  id: title.toLowerCase().replace(/\s/g, "-"),
  titleDisplay: title,
  titleCanonical: title.toLowerCase(),
  sortTitle: title.toLowerCase(),
  createdAt,
  editions: [
    {
      formatFamily: "EBOOK",
      contributors: authors.map((name) => ({
        role: "AUTHOR",
        contributor: { nameDisplay: name },
      })),
    },
  ],
});

const alpha = makeWork("Alpha", ["Zara"], new Date("2025-01-01"));
const bravo = makeWork("Bravo", ["Alice"], new Date("2025-02-01"));
const charlie = makeWork("Charlie", ["Mike"], new Date("2025-03-01"));

describe("sortAndFilterWorks", () => {
  it("returns all works when search is empty", () => {
    const result = sortAndFilterWorks([alpha, bravo] as never[], "", "title-asc");
    expect(result).toHaveLength(2);
  });

  it("filters by title (case-insensitive)", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "bra", "title-asc");
    expect(result).toHaveLength(1);
    expect((result[0] as MockWork).titleDisplay).toBe("Bravo");
  });

  it("filters by author (case-insensitive)", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "zara", "title-asc");
    expect(result).toHaveLength(1);
    expect((result[0] as MockWork).titleDisplay).toBe("Alpha");
  });

  it("sorts by title ascending", () => {
    const result = sortAndFilterWorks([charlie, alpha, bravo] as never[], "", "title-asc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by title descending", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "title-desc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("sorts by author ascending", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "author-asc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Bravo", "Charlie", "Alpha"]); // Alice, Mike, Zara
  });

  it("sorts by author descending", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "author-desc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Alpha", "Charlie", "Bravo"]); // Zara, Mike, Alice
  });

  it("sorts by recently added (newest first)", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "recent");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("combines filter and sort", () => {
    const delta = makeWork("Delta", ["Alice Delta"], new Date("2025-04-01"));
    const result = sortAndFilterWorks([alpha, bravo, charlie, delta] as never[], "ali", "title-desc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Delta", "Bravo"]); // Alice Delta, Alice — sorted Z-A
  });

  it("returns empty array when no matches", () => {
    const result = sortAndFilterWorks([alpha] as never[], "nonexistent", "title-asc");
    expect(result).toEqual([]);
  });

  it("handles works with no authors", () => {
    const noAuthor = makeWork("NoAuthor", []);
    const result = sortAndFilterWorks([noAuthor, alpha] as never[], "", "author-asc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    // "—" sorts before "Zara"
    expect(titles).toEqual(["NoAuthor", "Alpha"]);
  });

  it("sorts by format-asc (falls through to createdAt descending)", () => {
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "format-asc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("falls back to titleCanonical when sortTitle is null (title-asc)", () => {
    const nullA = { ...makeWork("Null A"), sortTitle: null } as never;
    const nullB = { ...makeWork("Null B"), sortTitle: null } as never;
    const result = sortAndFilterWorks([nullB, alpha, nullA] as never[], "", "title-asc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Alpha", "Null A", "Null B"]);
  });

  it("falls back to titleCanonical when sortTitle is null (title-desc)", () => {
    const nullA = { ...makeWork("Null A"), sortTitle: null } as never;
    const nullB = { ...makeWork("Null B"), sortTitle: null } as never;
    const result = sortAndFilterWorks([nullA, alpha, nullB] as never[], "", "title-desc");
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Null B", "Null A", "Alpha"]);
  });

  it("filters to 'reading' (0 < percent < 100)", () => {
    const progressMap = { alpha: 50, bravo: 100, charlie: 0 };
    const readingFilter: ReadingFilter = "reading";
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "title-asc", readingFilter, progressMap);
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Alpha"]);
  });

  it("filters to 'finished' (percent >= 100)", () => {
    const progressMap = { alpha: 50, bravo: 100 };
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "title-asc", "finished", progressMap);
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Bravo"]);
  });

  it("filters to 'unread' (no entry or 0)", () => {
    const progressMap = { alpha: 50, bravo: 0 };
    const result = sortAndFilterWorks([alpha, bravo, charlie] as never[], "", "title-asc", "unread", progressMap);
    const titles = result.map((w) => (w as MockWork).titleDisplay);
    expect(titles).toEqual(["Bravo", "Charlie"]);
  });

  it("'all' filter returns everything", () => {
    const progressMap = { alpha: 50 };
    const result = sortAndFilterWorks([alpha, bravo] as never[], "", "title-asc", "all", progressMap);
    expect(result).toHaveLength(2);
  });

  it("reading filter with no progressMap defaults to all", () => {
    const result = sortAndFilterWorks([alpha, bravo] as never[], "", "title-asc", "reading");
    expect(result).toHaveLength(0);
  });
});
