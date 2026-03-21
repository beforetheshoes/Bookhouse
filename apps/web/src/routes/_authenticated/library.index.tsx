import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import { useLibraryViewPreference } from "~/hooks/use-library-view-preference";
import { useLibraryTablePreferences } from "~/hooks/use-library-table-preferences";
import type { ColumnDef } from "@tanstack/react-table";
import { AlignJustify, BookOpen, Loader2, WrapText } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { DataTableColumnPicker } from "~/components/data-table/data-table-column-picker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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

const COLUMN_PICKER_ITEMS = [
  { id: "authors", label: "Author(s)" },
  { id: "formats", label: "Format" },
  { id: "publisher", label: "Publisher" },
  { id: "isbn", label: "ISBN" },
];

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
    size: 300,
    enableHiding: false,
  },
  {
    id: "authors",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Author(s)" />
    ),
    accessorFn: (row) => getAuthors(row),
    size: 200,
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
    size: 80,
  },
  {
    id: "publisher",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Publisher" />
    ),
    accessorFn: (row) => row.editions[0]?.publisher ?? "—",
    size: 150,
  },
  {
    id: "isbn",
    header: "ISBN",
    accessorFn: (row) =>
      row.editions[0]?.isbn13 ?? row.editions[0]?.isbn10 ?? "—",
    size: 120,
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
  const [tablePrefs, setTablePrefs] = useLibraryTablePreferences();
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [prevCount, setPrevCount] = useState(totalCount);

  const isScanning = activeJobCount > 0;
  const newCount = totalCount - prevCount;

  useSSE();

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

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      updateSearch({ pageSize, page: 1 });
    },
    [updateSearch],
  );

  const handleColumnToggle = useCallback(
    (columnId: string) => {
      const current = tablePrefs.columnVisibility[columnId] !== false;
      setTablePrefs({
        ...tablePrefs,
        columnVisibility: { ...tablePrefs.columnVisibility, [columnId]: !current },
      });
    },
    [tablePrefs, setTablePrefs],
  );

  const handleTextOverflowToggle = useCallback(() => {
    setTablePrefs({
      ...tablePrefs,
      textOverflow: tablePrefs.textOverflow === "truncate" ? "wrap" : "truncate",
    });
  }, [tablePrefs, setTablePrefs]);

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
        <div className="flex-1 min-w-0 space-y-4">
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
          {view === "table" && (
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTextOverflowToggle}
                aria-label={tablePrefs.textOverflow === "truncate" ? "Wrap text" : "Truncate text"}
              >
                {tablePrefs.textOverflow === "truncate" ? (
                  <WrapText className="mr-2 h-4 w-4" />
                ) : (
                  <AlignJustify className="mr-2 h-4 w-4" />
                )}
                {tablePrefs.textOverflow === "truncate" ? "Wrap" : "Truncate"}
              </Button>
              <DataTableColumnPicker
                columns={COLUMN_PICKER_ITEMS}
                columnVisibility={tablePrefs.columnVisibility}
                onToggle={handleColumnToggle}
              />
            </div>
          )}
          {view === "grid" ? (
            <LibraryGrid works={filteredByReading} progressMap={progressMap} />
          ) : (
            <VirtualizedDataTable
              columns={columns}
              data={filteredByReading}
              showPagination={false}
              columnVisibility={tablePrefs.columnVisibility}
              textOverflow={tablePrefs.textOverflow}
            />
          )}
          <LibraryPagination
            page={search.page}
            pageSize={search.pageSize}
            totalCount={totalCount}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>
    </div>
  );
}
