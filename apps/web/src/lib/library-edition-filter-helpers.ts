import type { LibrarySearchParams } from "~/lib/library-search-schema";

export const EDITION_COLUMN_SORT_MAP: Record<string, { asc: LibrarySearchParams["sort"]; desc: LibrarySearchParams["sort"] }> = {
  titleDisplay: { asc: "title-asc", desc: "title-desc" },
  authors: { asc: "author-asc", desc: "author-desc" },
  format: { asc: "format-asc", desc: "format-desc" },
  publisher: { asc: "publisher-asc", desc: "publisher-desc" },
  publishDate: { asc: "publishDate-asc", desc: "publishDate-desc" },
  pagesOrDuration: { asc: "pageCount-asc", desc: "pageCount-desc" },
  narrators: { asc: "narrator-asc", desc: "narrator-desc" },
  isbn13: { asc: "isbn13-asc", desc: "isbn13-desc" },
  isbn10: { asc: "isbn10-asc", desc: "isbn10-desc" },
  asin: { asc: "asin-asc", desc: "asin-desc" },
};

export const EDITION_SORT_TO_COLUMN: Record<string, { id: string; desc: boolean }> = {
  "title-asc": { id: "titleDisplay", desc: false },
  "title-desc": { id: "titleDisplay", desc: true },
  "author-asc": { id: "authors", desc: false },
  "author-desc": { id: "authors", desc: true },
  "format-asc": { id: "format", desc: false },
  "format-desc": { id: "format", desc: true },
  "publisher-asc": { id: "publisher", desc: false },
  "publisher-desc": { id: "publisher", desc: true },
  "publishDate-asc": { id: "publishDate", desc: false },
  "publishDate-desc": { id: "publishDate", desc: true },
  "pageCount-asc": { id: "pagesOrDuration", desc: false },
  "pageCount-desc": { id: "pagesOrDuration", desc: true },
  "narrator-asc": { id: "narrators", desc: false },
  "narrator-desc": { id: "narrators", desc: true },
  "isbn13-asc": { id: "isbn13", desc: false },
  "isbn13-desc": { id: "isbn13", desc: true },
  "isbn10-asc": { id: "isbn10", desc: false },
  "isbn10-desc": { id: "isbn10", desc: true },
  "asin-asc": { id: "asin", desc: false },
  "asin-desc": { id: "asin", desc: true },
};
