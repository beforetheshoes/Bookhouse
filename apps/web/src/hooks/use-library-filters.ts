import { useCallback, useMemo } from "react";
import type { SortingState, Updater } from "@tanstack/react-table";
import type { LibrarySearchParams } from "~/lib/library-search-schema";
import type { LibraryFilterValues } from "~/components/library-filters";
import { columnSortToParam, COLUMN_SORT_MAP, SORT_TO_COLUMN } from "~/lib/library-filter-helpers";

type NavigateFn = (opts: {
  to: string;
  search: (prev: Partial<LibrarySearchParams>) => LibrarySearchParams;
  replace: boolean;
}) => void | Promise<void>;

interface UseLibraryFiltersOptions {
  search: LibrarySearchParams;
  navigate: NavigateFn;
}

export function useLibraryFilters({ search, navigate }: UseLibraryFiltersOptions) {
  const updateSearch = useCallback(
    (updates: Partial<LibrarySearchParams>) => {
      void navigate({
        to: ".",
        search: (prev) => ({
          ...(prev as LibrarySearchParams),
          ...updates,
          page: updates.page ?? 1,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleFiltersChange = useCallback(
    (filters: LibraryFilterValues) => {
      updateSearch({
        format: filters.format as LibrarySearchParams["format"],
        authorId: filters.authorId,
        seriesId: filters.seriesId,
        hasCover: filters.hasCover,
        enriched: filters.enriched,
        hasDescription: filters.hasDescription,
        inSeries: filters.inSeries,
      });
    },
    [updateSearch],
  );

  const handleSearchChange = useCallback(
    (q: string) => {
      updateSearch({ q: q || undefined });
    },
    [updateSearch],
  );

  const handleSortChange = useCallback(
    (sort: string) => {
      updateSearch({ sort: sort as LibrarySearchParams["sort"] });
    },
    [updateSearch],
  );

  const tableSorting: SortingState = useMemo(() => {
    const mapped = SORT_TO_COLUMN[search.sort];
    return mapped ? [mapped] : [];
  }, [search.sort]);

  const handleColumnSort = useCallback(
    (updater: Updater<SortingState>) => {
      const newState = (updater as (prev: SortingState) => SortingState)(tableSorting);
      updateSearch({ sort: columnSortToParam(newState, COLUMN_SORT_MAP) });
    },
    [tableSorting, updateSearch],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      updateSearch({ page });
    },
    [updateSearch],
  );

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      updateSearch({ pageSize, page: 1 });
    },
    [updateSearch],
  );

  const currentFilters: LibraryFilterValues = {
    format: search.format,
    authorId: search.authorId,
    seriesId: search.seriesId,
    hasCover: search.hasCover,
    enriched: search.enriched,
    hasDescription: search.hasDescription,
    inSeries: search.inSeries,
  };

  return {
    updateSearch,
    handleFiltersChange,
    handleSearchChange,
    handleSortChange,
    handleColumnSort,
    handlePageChange,
    handlePageSizeChange,
    tableSorting,
    currentFilters,
  };
}
