import { describe, it, expect } from "vitest";
import {
  filterByReadingStatus,
  columnSortToParam,
  COLUMN_SORT_MAP,
  SORT_TO_COLUMN,
} from "./library-filter-helpers";

describe("filterByReadingStatus", () => {
  const works = [
    { id: "w1" },
    { id: "w2" },
    { id: "w3" },
  ] as { id: string }[];
  const progressMap = { w1: 0, w2: 50, w3: 100 };

  it("returns all works when filter is 'all'", () => {
    expect(filterByReadingStatus(works, "all", progressMap)).toEqual(works);
  });

  it("returns only reading works (0 < pct < 100)", () => {
    const result = filterByReadingStatus(works, "reading", progressMap);
    expect(result.map((w) => w.id)).toEqual(["w2"]);
  });

  it("returns only finished works (pct >= 100)", () => {
    const result = filterByReadingStatus(works, "finished", progressMap);
    expect(result.map((w) => w.id)).toEqual(["w3"]);
  });

  it("returns only unread works (pct === 0)", () => {
    const result = filterByReadingStatus(works, "unread", progressMap);
    expect(result.map((w) => w.id)).toEqual(["w1"]);
  });

  it("treats missing progressMap entries as 0", () => {
    const result = filterByReadingStatus([{ id: "unknown" }] as { id: string }[], "unread", {});
    expect(result).toHaveLength(1);
  });
});

describe("columnSortToParam", () => {
  it("returns title-asc for empty state", () => {
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([], map)).toBe("title-asc");
  });

  it("returns title-asc for unknown column id", () => {
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([{ id: "unknown", desc: false }], map)).toBe("title-asc");
  });

  it("returns asc sort param for ascending column", () => {
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([{ id: "titleDisplay", desc: false }], map)).toBe("title-asc");
  });

  it("returns desc sort param for descending column", () => {
    const map = { titleDisplay: { asc: "title-asc" as const, desc: "title-desc" as const } };
    expect(columnSortToParam([{ id: "titleDisplay", desc: true }], map)).toBe("title-desc");
  });
});

describe("COLUMN_SORT_MAP", () => {
  it("maps titleDisplay to title-asc/title-desc", () => {
    expect(COLUMN_SORT_MAP.titleDisplay).toEqual({ asc: "title-asc", desc: "title-desc" });
  });

  it("maps authors to author-asc/author-desc", () => {
    expect(COLUMN_SORT_MAP.authors).toEqual({ asc: "author-asc", desc: "author-desc" });
  });

  it("maps publisher to publisher-asc/publisher-desc", () => {
    expect(COLUMN_SORT_MAP.publisher).toEqual({ asc: "publisher-asc", desc: "publisher-desc" });
  });

  it("maps formats to format-asc/format-desc", () => {
    expect(COLUMN_SORT_MAP.formats).toEqual({ asc: "format-asc", desc: "format-desc" });
  });

  it("maps isbn to isbn-asc/isbn-desc", () => {
    expect(COLUMN_SORT_MAP.isbn).toEqual({ asc: "isbn-asc", desc: "isbn-desc" });
  });
});

describe("SORT_TO_COLUMN", () => {
  it("maps title-asc to titleDisplay ascending", () => {
    expect(SORT_TO_COLUMN["title-asc"]).toEqual({ id: "titleDisplay", desc: false });
  });

  it("maps title-desc to titleDisplay descending", () => {
    expect(SORT_TO_COLUMN["title-desc"]).toEqual({ id: "titleDisplay", desc: true });
  });

  it("maps all author sort params", () => {
    expect(SORT_TO_COLUMN["author-asc"]).toEqual({ id: "authors", desc: false });
    expect(SORT_TO_COLUMN["author-desc"]).toEqual({ id: "authors", desc: true });
  });

  it("maps all publisher sort params", () => {
    expect(SORT_TO_COLUMN["publisher-asc"]).toEqual({ id: "publisher", desc: false });
    expect(SORT_TO_COLUMN["publisher-desc"]).toEqual({ id: "publisher", desc: true });
  });

  it("maps all format sort params", () => {
    expect(SORT_TO_COLUMN["format-asc"]).toEqual({ id: "formats", desc: false });
    expect(SORT_TO_COLUMN["format-desc"]).toEqual({ id: "formats", desc: true });
  });

  it("maps all isbn sort params", () => {
    expect(SORT_TO_COLUMN["isbn-asc"]).toEqual({ id: "isbn", desc: false });
    expect(SORT_TO_COLUMN["isbn-desc"]).toEqual({ id: "isbn", desc: true });
  });
});
