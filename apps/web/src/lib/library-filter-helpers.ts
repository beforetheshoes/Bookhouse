import type { SortingState } from "@tanstack/react-table";
import type { LibrarySearchParams } from "~/lib/library-search-schema";
import type { ReadingFilter } from "~/lib/sort-filter-works";

export function filterByReadingStatus<T extends { id: string }>(
  works: T[],
  readingFilter: ReadingFilter,
  progressMap: Record<string, number>,
): T[] {
  if (readingFilter === "all") return works;
  return works.filter((w) => {
    const pct = progressMap[w.id] ?? 0;
    switch (readingFilter) {
      case "reading":
        return pct > 0 && pct < 100;
      case "finished":
        return pct >= 100;
      case "unread":
        return pct === 0;
    }
  });
}

export function columnSortToParam(
  state: SortingState,
  map: Record<string, { asc: LibrarySearchParams["sort"]; desc: LibrarySearchParams["sort"] }>,
): LibrarySearchParams["sort"] {
  const entry = state[0];
  if (!entry) return "title-asc";
  const col = map[entry.id];
  if (!col) return "title-asc";
  return entry.desc ? col.desc : col.asc;
}

export const COLUMN_SORT_MAP: Record<string, { asc: LibrarySearchParams["sort"]; desc: LibrarySearchParams["sort"] }> = {
  titleDisplay: { asc: "title-asc", desc: "title-desc" },
  authors: { asc: "author-asc", desc: "author-desc" },
  formats: { asc: "format-asc", desc: "format-desc" },
};

export const SORT_TO_COLUMN: Record<string, { id: string; desc: boolean }> = {
  "title-asc": { id: "titleDisplay", desc: false },
  "title-desc": { id: "titleDisplay", desc: true },
  "author-asc": { id: "authors", desc: false },
  "author-desc": { id: "authors", desc: true },
  "format-asc": { id: "formats", desc: false },
  "format-desc": { id: "formats", desc: true },
};
