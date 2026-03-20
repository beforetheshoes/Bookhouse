import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import { useLibraryViewPreference } from "~/hooks/use-library-view-preference";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, Loader2 } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { LibraryToolbar } from "~/components/library-toolbar";
import { LibraryGrid } from "~/components/library-grid";
import { LibraryFilters, type LibraryFilterValues } from "~/components/library-filters";
import { LibraryPagination } from "~/components/library-pagination";
import { librarySearchSchema } from "~/lib/library-search-schema";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import {
  getFilteredLibraryWorksServerFn,
  type LibraryWork,
} from "~/lib/server-fns/library";
import { getActiveJobCountServerFn } from "~/lib/server-fns/import-jobs";
import { getBulkReadingProgressServerFn } from "~/lib/server-fns/reading-progress";

export const Route = createFileRoute("/_authenticated/library/")({
  validateSearch: (search) => librarySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [libraryResult, activeJobCount, progressMap] = await Promise.all([
      getFilteredLibraryWorksServerFn({ data: deps }),
      getActiveJobCountServerFn(),
      getBulkReadingProgressServerFn(),
    ]);
    return { libraryResult, activeJobCount, progressMap };
  },
  pendingComponent: GridPageSkeleton,
  component: LibraryPage,
});

function getAuthors(work: LibraryWork): string {
  const authors = work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ") || "—";
}

function getFormats(work: LibraryWork): string[] {
  return [...new Set(work.editions.map((e) => e.formatFamily))];
}

const columns: ColumnDef<LibraryWork>[] = [
  {
    accessorKey: "titleDisplay",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => (
      <Link to="/library/$workId" params={{ workId: row.original.id }} search={{ page: 1, pageSize: 50, sort: "title-asc" as const }} className="flex items-center gap-2">
        {row.original.titleDisplay}
        {row.original.enrichmentStatus === "STUB" && (
          <Badge variant="outline" className="animate-pulse px-1.5 py-0 text-[10px]">
            Processing&hellip;
          </Badge>
        )}
      </Link>
    ),
  },
  {
    id: "authors",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Author(s)" />
    ),
    accessorFn: (row) => getAuthors(row),
  },
  {
    id: "formats",
    header: "Format",
    cell: ({ row }) =>
      getFormats(row.original).map((f) => (
        <Badge key={f} variant="secondary" className="mr-1">
          {f}
        </Badge>
      )),
  },
  {
    id: "publisher",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Publisher" />
    ),
    accessorFn: (row) => row.editions[0]?.publisher ?? "—",
  },
  {
    id: "isbn",
    header: "ISBN",
    accessorFn: (row) =>
      row.editions[0]?.isbn13 ?? row.editions[0]?.isbn10 ?? "—",
  },
];

function filterByReadingStatus(
  works: LibraryWork[],
  readingFilter: ReadingFilter,
  progressMap: Record<string, number>,
): LibraryWork[] {
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

function LibraryPage() {
  const { libraryResult, activeJobCount, progressMap } = Route.useLoaderData();
  const { works, totalCount, facetCounts } = libraryResult;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [view, setView] = useLibraryViewPreference();
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [prevCount, setPrevCount] = useState(totalCount);

  const isScanning = activeJobCount > 0;
  const newCount = totalCount - prevCount;

  useSSE({ enabled: isScanning });

  useEffect(() => {
    if (!isScanning) {
      setPrevCount(totalCount);
    }
  }, [isScanning, totalCount]);

  const updateSearch = useCallback(
    (updates: Record<string, unknown>) => {
      void navigate({
        to: ".",
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          ...updates,
          page: updates.page ?? 1,
        })) as unknown as Record<string, unknown>,
        replace: true,
      });
    },
    [navigate],
  );

  const handleFiltersChange = useCallback(
    (filters: LibraryFilterValues) => {
      updateSearch({
        format: filters.format,
        authorId: filters.authorId,
        seriesId: filters.seriesId,
        publisher: filters.publisher,
        hasCover: filters.hasCover,
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
      updateSearch({ sort });
    },
    [updateSearch],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      updateSearch({ page });
    },
    [updateSearch],
  );

  const filteredByReading = useMemo(
    () => filterByReadingStatus(works, readingFilter, progressMap),
    [works, readingFilter, progressMap],
  );

  const currentFilters: LibraryFilterValues = {
    format: search.format,
    authorId: search.authorId,
    seriesId: search.seriesId,
    publisher: search.publisher,
    hasCover: search.hasCover,
  };

  if (totalCount === 0 && !isScanning && !search.q && !search.format && !search.authorId && !search.seriesId && !search.publisher && search.hasCover === undefined) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Library</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="size-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">No works yet</h2>
          <p className="mt-2 text-muted-foreground">
            Add a library root in{" "}
            <Link to="/settings/libraries" className="underline">
              settings
            </Link>
            {" "}to start scanning your collection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="mb-6 mt-2 text-muted-foreground">
            Browse and manage your works.
          </p>
        </div>
        {isScanning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>
              Scanning{newCount > 0 ? ` — ${String(newCount)} new` : ""}...
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-6">
        <aside className="w-56 shrink-0">
          <LibraryFilters
            facetCounts={facetCounts}
            filters={currentFilters}
            onFiltersChange={handleFiltersChange}
          />
        </aside>
        <div className="flex-1 space-y-4">
          <LibraryToolbar
            searchValue={search.q ?? ""}
            onSearchChange={handleSearchChange}
            sortValue={search.sort}
            onSortChange={handleSortChange}
            view={view}
            onViewChange={setView}
            filterValue={readingFilter}
            onFilterChange={setReadingFilter}
          />
          {view === "grid" ? (
            <LibraryGrid works={filteredByReading} progressMap={progressMap} />
          ) : (
            <VirtualizedDataTable columns={columns} data={filteredByReading} />
          )}
          <LibraryPagination
            page={search.page}
            pageSize={search.pageSize}
            totalCount={totalCount}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    </div>
  );
}
