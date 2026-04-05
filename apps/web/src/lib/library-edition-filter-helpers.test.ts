import { describe, it, expect } from "vitest";
import { columnSortToParam } from "./library-filter-helpers";
import {
  EDITION_COLUMN_SORT_MAP,
  EDITION_SORT_TO_COLUMN,
} from "./library-edition-filter-helpers";

describe("EDITION_COLUMN_SORT_MAP", () => {
  it("maps titleDisplay to title-asc/title-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.titleDisplay).toEqual({ asc: "title-asc", desc: "title-desc" });
  });

  it("maps authors to author-asc/author-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.authors).toEqual({ asc: "author-asc", desc: "author-desc" });
  });

  it("maps format to format-asc/format-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.format).toEqual({ asc: "format-asc", desc: "format-desc" });
  });

  it("maps publisher to publisher-asc/publisher-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.publisher).toEqual({ asc: "publisher-asc", desc: "publisher-desc" });
  });

  it("maps publishDate to publishDate-asc/publishDate-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.publishDate).toEqual({ asc: "publishDate-asc", desc: "publishDate-desc" });
  });

  it("maps pagesOrDuration to pageCount-asc/pageCount-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.pagesOrDuration).toEqual({ asc: "pageCount-asc", desc: "pageCount-desc" });
  });

  it("maps narrators to narrator-asc/narrator-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.narrators).toEqual({ asc: "narrator-asc", desc: "narrator-desc" });
  });

  it("maps isbn13 to isbn13-asc/isbn13-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.isbn13).toEqual({ asc: "isbn13-asc", desc: "isbn13-desc" });
  });

  it("maps isbn10 to isbn10-asc/isbn10-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.isbn10).toEqual({ asc: "isbn10-asc", desc: "isbn10-desc" });
  });

  it("maps asin to asin-asc/asin-desc", () => {
    expect(EDITION_COLUMN_SORT_MAP.asin).toEqual({ asc: "asin-asc", desc: "asin-desc" });
  });
});

describe("EDITION_SORT_TO_COLUMN", () => {
  it.each([
    ["title-asc", { id: "titleDisplay", desc: false }],
    ["title-desc", { id: "titleDisplay", desc: true }],
    ["author-asc", { id: "authors", desc: false }],
    ["author-desc", { id: "authors", desc: true }],
    ["format-asc", { id: "format", desc: false }],
    ["format-desc", { id: "format", desc: true }],
    ["publisher-asc", { id: "publisher", desc: false }],
    ["publisher-desc", { id: "publisher", desc: true }],
    ["publishDate-asc", { id: "publishDate", desc: false }],
    ["publishDate-desc", { id: "publishDate", desc: true }],
    ["pageCount-asc", { id: "pagesOrDuration", desc: false }],
    ["pageCount-desc", { id: "pagesOrDuration", desc: true }],
    ["narrator-asc", { id: "narrators", desc: false }],
    ["narrator-desc", { id: "narrators", desc: true }],
    ["isbn13-asc", { id: "isbn13", desc: false }],
    ["isbn13-desc", { id: "isbn13", desc: true }],
    ["isbn10-asc", { id: "isbn10", desc: false }],
    ["isbn10-desc", { id: "isbn10", desc: true }],
    ["asin-asc", { id: "asin", desc: false }],
    ["asin-desc", { id: "asin", desc: true }],
  ] as const)("maps %s correctly", (sortKey, expected) => {
    expect(EDITION_SORT_TO_COLUMN[sortKey]).toEqual(expected);
  });
});

describe("columnSortToParam with EDITION_COLUMN_SORT_MAP", () => {
  it("returns publisher-desc for publisher descending", () => {
    expect(
      columnSortToParam([{ id: "publisher", desc: true }], EDITION_COLUMN_SORT_MAP),
    ).toBe("publisher-desc");
  });

  it("returns narrator-asc for narrators ascending", () => {
    expect(
      columnSortToParam([{ id: "narrators", desc: false }], EDITION_COLUMN_SORT_MAP),
    ).toBe("narrator-asc");
  });
});
