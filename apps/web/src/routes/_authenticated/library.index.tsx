import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import { useEffectiveLibraryView } from "~/hooks/use-library-view-preference";
import { useLibraryTablePreferences } from "~/hooks/use-library-table-preferences";
import { useGridTileSize } from "~/hooks/use-grid-tile-size";
import { useLibraryFilters } from "~/hooks/use-library-filters";
import type { RowSelectionState } from "@tanstack/react-table";
import { BookOpen, Loader2 } from "lucide-react";
import { LibrarySelectionToolbar } from "~/components/library-selection-toolbar";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { getColumns, COLUMN_PICKER_ITEMS } from "~/lib/library-columns";
import { getEditionColumns, EDITION_COLUMN_PICKER_ITEMS } from "~/lib/library-edition-columns";
import { LibraryTableView } from "~/components/library-table-view";
import { filterByReadingStatus } from "~/lib/library-filter-helpers";
import { EDITION_COLUMN_SORT_MAP, EDITION_SORT_TO_COLUMN } from "~/lib/library-edition-filter-helpers";
import { LibraryToolbar } from "~/components/library-toolbar";
import { LibraryGrid } from "~/components/library-grid";
import { LibraryFilters } from "~/components/library-filters";
import { LibraryFiltersSheet } from "~/components/library-filters-sheet";
import { LibraryPagination } from "~/components/library-pagination";
import { librarySearchSchema } from "~/lib/library-search-schema";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import { getFilteredLibraryWorksServerFn, getFilteredLibraryEditionsServerFn, getAllFilteredWorkIdsServerFn } from "~/lib/server-fns/library";
import { getActiveJobCountServerFn } from "~/lib/server-fns/import-jobs";
import { getBulkReadingProgressServerFn } from "~/lib/server-fns/reading-progress";
import { getShelvesServerFn } from "~/lib/server-fns/shelves";

export const Route = createFileRoute("/_authenticated/library/")({
  validateSearch: (search) => librarySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const isEditionsView = deps.view === "editions";

    const [libraryResult, editionsResult, activeJobCount, progressMap, shelves] = await Promise.all([
      // Always fetch the works page in full. The loader knows neither the
      // viewport nor the stored display preference, so a pageSize:1 shortcut
      // for the editions view silently produced a one-item library whenever
      // the grid was what actually rendered.
      getFilteredLibraryWorksServerFn({ data: deps }),
      isEditionsView
        ? getFilteredLibraryEditionsServerFn({ data: deps })
        : Promise.resolve(null),
      getActiveJobCountServerFn(),
      getBulkReadingProgressServerFn(),
      getShelvesServerFn(),
    ]);
    return { libraryResult, editionsResult, activeJobCount, progressMap, shelves };
  },
  pendingComponent: GridPageSkeleton,
  component: LibraryPage,
});

function LibraryPage() {
  const { libraryResult, editionsResult, activeJobCount, progressMap, shelves } = Route.useLoaderData();
  const { works, totalCount, facetCounts, totalFacetCounts } = libraryResult;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [view, setView] = useEffectiveLibraryView();
  const [tileSize, setTileSize] = useGridTileSize();
  const [tablePrefs, setTablePrefs] = useLibraryTablePreferences();
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [prevCount, setPrevCount] = useState(totalCount);

  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [allWorkIds, setAllWorkIds] = useState<string[] | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const isScanning = activeJobCount > 0;
  // The editions view only exists inside the table, and `view` is forced to
  // "grid" on phones. Deriving this from the *effective* view keeps the sort
  // map, the pagination count and the rendered list from disagreeing when a
  // phone opens a ?view=editions link — where the toggle that would normally
  // reset it is hidden.
  const isEditionsView = search.view === "editions" && view === "table";

  const workColumns = useMemo(() => getColumns(isScanning, editMode, router, progressMap), [isScanning, editMode, router, progressMap]);
  const editionColumns = useMemo(() => getEditionColumns(editMode, router), [editMode, router]);
  const newCount = totalCount - prevCount;

  const filteredByReading = useMemo(
    () => filterByReadingStatus(works, readingFilter, progressMap),
    [works, readingFilter, progressMap],
  );

  // Keyed by work id, so a refreshed or reordered list cannot repoint it.
  // Still filtered against the current list: a selected work can disappear.
  const pageSelectedWorkIds = useMemo(() => {
    const present = new Set(filteredByReading.map((w) => w.id));
    return Object.keys(rowSelection).filter((id) => present.has(id));
  }, [rowSelection, filteredByReading]);

  const selectedWorkIds = allWorkIds ?? pageSelectedWorkIds;
  const selectedCount = allWorkIds ? allWorkIds.length : Object.keys(rowSelection).length;
  const allPageRowsSelected = filteredByReading.length > 0 && Object.keys(rowSelection).length === filteredByReading.length;

  const selectedWorks = useMemo(() => {
    const idSet = new Set(selectedWorkIds);
    return filteredByReading
      .filter((w) => idSet.has(w.id))
      .map((w) => ({ id: w.id, title: w.titleDisplay, editionCount: w.editions.length }));
  }, [selectedWorkIds, filteredByReading]);

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
    handleViewModeChange,
    handlePageChange,
    handlePageSizeChange,
    tableSorting,
    currentFilters,
  } = useLibraryFilters({
    search,
    navigate,
    ...(isEditionsView
      ? { sortMap: EDITION_COLUMN_SORT_MAP, sortToColumn: EDITION_SORT_TO_COLUMN }
      : {}),
  });

  const handleToggleGridSelect = useCallback((workId: string) => {
    setAllWorkIds(null);
    setRowSelection((prev) => {
      if (prev[workId] === true) {
        return Object.fromEntries(
          Object.entries(prev).filter(([rowKey]) => rowKey !== workId),
        );
      }
      return { ...prev, [workId]: true };
    });
  }, []);

  const handleSelectModeChange = useCallback((on: boolean) => {
    setSelectMode(on);
    if (!on) {
      setRowSelection({});
      setAllWorkIds(null);
    }
  }, []);

  const handleEditModeToggle = useCallback(() => { setEditMode(!editMode); }, [editMode]);

  const handleDisplayViewChange = useCallback((v: "grid" | "table") => {
    setView(v);
    if (v === "grid" && isEditionsView) {
      handleViewModeChange("works");
    }
  }, [isEditionsView, handleViewModeChange, setView]);

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
          hasCover: search.hasCover,
          enriched: search.enriched,
          hasDescription: search.hasDescription,
          inSeries: search.inSeries,
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

  // On a phone `view` is forced to "grid", which makes the editions branch
  // below unreachable — pagination must count works, not editions.
  const effectiveTotalCount =
    isEditionsView && editionsResult ? editionsResult.totalCount : totalCount;

  if (totalCount === 0 && !isEditionsView && !isScanning && !search.q && !search.format && !search.authorId && !search.seriesId && search.hasCover === undefined && search.enriched === undefined && search.hasDescription === undefined && search.inSeries === undefined) {
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
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <aside
          data-testid="library-filters-rail"
          className="hidden lg:block lg:w-56 lg:shrink-0"
        >
          <LibraryFilters
            facetCounts={facetCounts}
            totalFacetCounts={totalFacetCounts}
            filters={currentFilters}
            onFiltersChange={handleFiltersChange}
          />
        </aside>
        <div className="flex-1 min-w-0 space-y-4">
          <LibraryFiltersSheet
            facetCounts={facetCounts}
            totalFacetCounts={totalFacetCounts}
            filters={currentFilters}
            onFiltersChange={handleFiltersChange}
          />
          <LibraryToolbar
            searchValue={search.q ?? ""}
            onSearchChange={handleSearchChange}
            sortValue={search.sort}
            onSortChange={handleSortChange}
            view={view}
            onViewChange={handleDisplayViewChange}
            filterValue={readingFilter}
            onFilterChange={setReadingFilter}
            showSort={view !== "table"}
            selectMode={selectMode}
            onSelectModeChange={handleSelectModeChange}
            tileSize={tileSize}
            onTileSizeChange={setTileSize}
          />
          {view === "grid" ? (
            <LibraryGrid
              works={filteredByReading}
              progressMap={progressMap}
              scanActive={isScanning}
              tileSize={tileSize}
              selectable={selectMode}
              rowSelection={rowSelection}
              onToggleSelect={handleToggleGridSelect}
            />
          ) : isEditionsView && editionsResult ? (
            <LibraryTableView
              works={editionsResult.editions}
              columns={editionColumns}
              editMode={editMode}
              onEditModeToggle={handleEditModeToggle}
              tablePrefs={tablePrefs}
              onColumnToggle={handleColumnToggle}
              onTextOverflowToggle={handleTextOverflowToggle}
              rowSelection={{}}
              onRowSelectionChange={setRowSelection}
              sorting={tableSorting}
              onSortingChange={handleColumnSort}
              viewMode="editions"
              onViewModeChange={handleViewModeChange}
              columnPickerItems={EDITION_COLUMN_PICKER_ITEMS}
            />
          ) : (
            <LibraryTableView
              works={filteredByReading}
              columns={workColumns}
              editMode={editMode}
              onEditModeToggle={handleEditModeToggle}
              tablePrefs={tablePrefs}
              onColumnToggle={handleColumnToggle}
              onTextOverflowToggle={handleTextOverflowToggle}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              sorting={tableSorting}
              onSortingChange={handleColumnSort}
              viewMode="works"
              onViewModeChange={handleViewModeChange}
              columnPickerItems={COLUMN_PICKER_ITEMS}
            />
          )}
          <LibraryPagination
            page={search.page}
            pageSize={search.pageSize}
            totalCount={effectiveTotalCount}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>

      <LibrarySelectionToolbar
        selectedCount={selectedCount}
        selectedWorkIds={selectedWorkIds}
        selectedWorks={selectedWorks}
        shelves={shelves}
        totalCount={totalCount}
        allPageRowsSelected={allPageRowsSelected}
        onSelectAll={() => { void handleSelectAll(); }}
        selectingAll={selectingAll}
        onDeleted={handleSelectionDone}
        onMerged={handleSelectionDone}
        onAddedToShelf={handleSelectionDone}
        onEnrichStarted={handleSelectionDone}
        onMarkedAsRead={handleSelectionDone}
        onClearSelection={() => { setRowSelection({}); setAllWorkIds(null); }}
      />
    </div>
  );
}
