import type { SortingState } from "@tanstack/react-table";
import type { LibrarySearchParams } from "~/lib/library-search-schema";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import type { LibraryFilterValues } from "~/components/library-filters";

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

/**
 * How many individual facet selections are active.
 *
 * Written over arrays rather than as a chain of `?.length ?? 0` so it carries
 * two branches instead of fourteen — the 100% branch threshold makes the naive
 * form disproportionately expensive to cover.
 */
export function countActiveFilters(filters: LibraryFilterValues): number {
  const lists = [filters.format, filters.authorId, filters.seriesId];
  const booleans = [
    filters.hasCover,
    filters.enriched,
    filters.hasDescription,
    filters.inSeries,
  ];
  return (
    lists.reduce<number>((total, list) => total + (list ? list.length : 0), 0) +
    booleans.filter((value) => value !== undefined).length
  );
}
