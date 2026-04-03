import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import { useLibraryViewPreference } from "~/hooks/use-library-view-preference";
import { useLibraryTablePreferences } from "~/hooks/use-library-table-preferences";
import { useGridTileSize } from "~/hooks/use-grid-tile-size";
import { useLibraryFilters } from "~/hooks/use-library-filters";
import type { RowSelectionState } from "@tanstack/react-table";
import { BookOpen, Loader2 } from "lucide-react";
import { LibrarySelectionToolbar } from "~/components/library-selection-toolbar";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { getColumns } from "~/lib/library-columns";
import { LibraryTableView } from "~/components/library-table-view";
import { filterByReadingStatus } from "~/lib/library-filter-helpers";
import { LibraryToolbar } from "~/components/library-toolbar";
import { LibraryGrid } from "~/components/library-grid";
import { LibraryFilters } from "~/components/library-filters";
import { LibraryPagination } from "~/components/library-pagination";
import { librarySearchSchema } from "~/lib/library-search-schema";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import { getFilteredLibraryWorksServerFn, getAllFilteredWorkIdsServerFn } from "~/lib/server-fns/library";
import { getActiveJobCountServerFn } from "~/lib/server-fns/import-jobs";
import { getBulkReadingProgressServerFn } from "~/lib/server-fns/reading-progress";
import { getShelvesServerFn } from "~/lib/server-fns/shelves";

export const Route = createFileRoute("/_authenticated/library/")({
  validateSearch: (search) => librarySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [libraryResult, activeJobCount, progressMap, shelves] = await Promise.all([
      getFilteredLibraryWorksServerFn({ data: deps }),
      getActiveJobCountServerFn(),
      getBulkReadingProgressServerFn(),
      getShelvesServerFn(),
    ]);
    return { libraryResult, activeJobCount, progressMap, shelves };
  },
  pendingComponent: GridPageSkeleton,
  component: LibraryPage,
});

function LibraryPage() {
  const { libraryResult, activeJobCount, progressMap, shelves } = Route.useLoaderData();
  const { works, totalCount, facetCounts, totalFacetCounts } = libraryResult;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [view, setView] = useLibraryViewPreference();
  const [tileSize, setTileSize] = useGridTileSize();
  const [tablePrefs, setTablePrefs] = useLibraryTablePreferences();
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [prevCount, setPrevCount] = useState(totalCount);

  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [allWorkIds, setAllWorkIds] = useState<string[] | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const isScanning = activeJobCount > 0;
  const columns = useMemo(() => getColumns(isScanning, editMode, router, progressMap), [isScanning, editMode, router, progressMap]);
  const newCount = totalCount - prevCount;

  const filteredByReading = useMemo(
    () => filterByReadingStatus(works, readingFilter, progressMap),
    [works, readingFilter, progressMap],
  );

  const pageSelectedWorkIds = useMemo(() => {
    return Object.keys(rowSelection)
      .map((idx) => filteredByReading[Number(idx)]?.id)
      .filter((id): id is string => id !== undefined);
  }, [rowSelection, filteredByReading]);

  const selectedWorkIds = allWorkIds ?? pageSelectedWorkIds;
  const selectedCount = allWorkIds ? allWorkIds.length : Object.keys(rowSelection).length;
  const allPageRowsSelected = filteredByReading.length > 0 && Object.keys(rowSelection).length === filteredByReading.length;

  useSSE();

  useEffect(() => {
    if (!isScanning) {
      setPrevCount(totalCount);
    }
  }, [isScanning, totalCount]);

  const {
    handleFiltersChange,
    handleSearchChange,
    handleSortChange,
    handleColumnSort,
    handlePageChange,
    handlePageSizeChange,
    tableSorting,
    currentFilters,
  } = useLibraryFilters({ search, navigate });

  const handleColumnToggle = (columnId: string) => {
    const current = tablePrefs.columnVisibility[columnId] !== false;
    setTablePrefs({
      ...tablePrefs,
      columnVisibility: { ...tablePrefs.columnVisibility, [columnId]: !current },
    });
  };

  const handleTextOverflowToggle = () => {
    setTablePrefs({
      ...tablePrefs,
      textOverflow: tablePrefs.textOverflow === "truncate" ? "wrap" : "truncate",
    });
  };

  const handleSelectAll = async () => {
    setSelectingAll(true);
    try {
      const ids = await getAllFilteredWorkIdsServerFn({
        data: {
          q: search.q,
          format: search.format,
          authorId: search.authorId,
          seriesId: search.seriesId,
          publisher: search.publisher,
          hasCover: search.hasCover,
          enriched: search.enriched,
          hasDescription: search.hasDescription,
          inSeries: search.inSeries,
          hasIsbn: search.hasIsbn,
        },
      });
      setAllWorkIds(ids);
    } finally {
      setSelectingAll(false);
    }
  };

  const handleSelectionDone = () => {
    setRowSelection({});
    setAllWorkIds(null);
    void router.invalidate();
  };

  if (totalCount === 0 && !isScanning && !search.q && !search.format && !search.authorId && !search.seriesId && !search.publisher && search.hasCover === undefined && search.enriched === undefined && search.hasDescription === undefined && search.inSeries === undefined && search.hasIsbn === undefined) {
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
            totalFacetCounts={totalFacetCounts}
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
            showSort={view !== "table"}
            tileSize={tileSize}
            onTileSizeChange={setTileSize}
          />
          {view === "grid" ? (
            <LibraryGrid works={filteredByReading} progressMap={progressMap} scanActive={isScanning} tileSize={tileSize} />
          ) : (
            <LibraryTableView
              works={filteredByReading}
              columns={columns}
              editMode={editMode}
              onEditModeToggle={() => { setEditMode(!editMode); }}
              tablePrefs={tablePrefs}
              onColumnToggle={handleColumnToggle}
              onTextOverflowToggle={handleTextOverflowToggle}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              sorting={tableSorting}
              onSortingChange={handleColumnSort}
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

      <LibrarySelectionToolbar
        selectedCount={selectedCount}
        selectedWorkIds={selectedWorkIds}
        shelves={shelves}
        totalCount={totalCount}
        allPageRowsSelected={allPageRowsSelected}
        onSelectAll={() => { void handleSelectAll(); }}
        selectingAll={selectingAll}
        onDeleted={handleSelectionDone}
        onAddedToShelf={handleSelectionDone}
        onEnrichStarted={handleSelectionDone}
        onClearSelection={() => { setRowSelection({}); setAllWorkIds(null); }}
      />
    </div>
  );
}
