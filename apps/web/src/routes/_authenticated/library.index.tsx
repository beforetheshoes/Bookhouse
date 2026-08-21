import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import { useEffectiveLibraryView, type LibraryView } from "~/hooks/use-library-view-preference";
import { useLibraryTablePreferences } from "~/hooks/use-library-table-preferences";
import { useEffectiveGridTileSize } from "~/hooks/use-grid-tile-size";
import { useLibraryFilters } from "~/hooks/use-library-filters";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
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
import { LibraryList } from "~/components/library-list";
import { AlphabetScrubber } from "~/components/alphabet-scrubber";
import { LibraryFilters } from "~/components/library-filters";
import { LibraryFiltersSheet } from "~/components/library-filters-sheet";
import { LibraryPagination } from "~/components/library-pagination";
import { librarySearchSchema } from "~/lib/library-search-schema";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import { getFilteredLibraryWorksServerFn, getFilteredLibraryEditionsServerFn, getAllFilteredWorkIdsServerFn, getWorkOffsetForLetterServerFn, type LibraryWork } from "~/lib/server-fns/library";
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
  const [tileSize, setTileSize] = useEffectiveGridTileSize();
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

  // Pages appended by the list's infinite scroll. The loader still owns page
  // one, so this resets whenever it hands over a different first page - a new
  // filter, a new sort, or a jump to page N from a desktop.
  const [appendedWorks, setAppendedWorks] = useState<LibraryWork[]>([]);
  const [lastLoadedPage, setLastLoadedPage] = useState(search.page);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped by everything that throws the appended pages away. A request that
  // was in flight across one of those checks this before appending, so a slow
  // page two cannot land back in a view that has already moved on.
  const appendGenerationRef = useRef(0);

  // loaderDeps is the whole search object, so this changes exactly when the
  // loader would hand over a different first page.
  const loaderPageKey = JSON.stringify(search);
  const lastPageKeyRef = useRef(loaderPageKey);
  if (lastPageKeyRef.current !== loaderPageKey) {
    // Runs once per change, during render, which is the sanctioned way to
    // reset state derived from props.
    lastPageKeyRef.current = loaderPageKey;
    appendGenerationRef.current += 1;
    setAppendedWorks([]);
    setLastLoadedPage(search.page);
  }

  const allLoadedWorks = useMemo(
    () => (appendedWorks.length > 0 ? [...works, ...appendedWorks] : works),
    [works, appendedWorks],
  );

  const filteredByReading = useMemo(
    () => filterByReadingStatus(allLoadedWorks, readingFilter, progressMap),
    [allLoadedWorks, readingFilter, progressMap],
  );

  const loadedCount = search.page * search.pageSize + appendedWorks.length;
  const hasMore = loadedCount < totalCount;

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = lastLoadedPage + 1;
    const generation = appendGenerationRef.current;
    void getFilteredLibraryWorksServerFn({ data: { ...search, page: nextPage } })
      .then((result) => {
        if (appendGenerationRef.current !== generation) return;
        setAppendedWorks((prev) => [...prev, ...result.works]);
        setLastLoadedPage(nextPage);
      })
      .finally(() => { setLoadingMore(false); });
  }, [loadingMore, hasMore, lastLoadedPage, search]);

  // Keyed by work id, so a refreshed or reordered list cannot repoint it.
  // Still filtered against the current list: a selected work can disappear.
  const pageSelectedWorkIds = useMemo(() => {
    const present = new Set(filteredByReading.map((w) => w.id));
    return Object.keys(rowSelection).filter((id) => present.has(id));
  }, [rowSelection, filteredByReading]);

  const selectedWorkIds = allWorkIds ?? pageSelectedWorkIds;
  // Both derived from the filtered ids, not the raw keys: a selected work can
  // leave the list, and a bar that counts what the mutation will not act on is
  // lying - and can raise the "select all N" banner spuriously.
  const selectedCount = allWorkIds ? allWorkIds.length : pageSelectedWorkIds.length;
  const allPageRowsSelected =
    filteredByReading.length > 0 &&
    pageSelectedWorkIds.length === filteredByReading.length;

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

  const [jumpingToLetter, setJumpingToLetter] = useState<string | null>(null);

  /**
   * Jumps the list to the first work under `letter`.
   *
   * The letter is almost never in the rows already loaded, so the offset comes
   * from the server and becomes a page. Changing the page resets the appended
   * rows on its own, and the list picks up scrolling from there.
   */
  const handleJumpToLetter = useCallback((letter: string) => {
    setJumpingToLetter(letter);
    void getWorkOffsetForLetterServerFn({
      data: {
        q: search.q,
        format: search.format,
        authorId: search.authorId,
        seriesId: search.seriesId,
        hasCover: search.hasCover,
        enriched: search.enriched,
        hasDescription: search.hasDescription,
        inSeries: search.inSeries,
        letter,
        sort: search.sort === "title-desc" ? "title-desc" : "title-asc",
      },
    })
      .then(({ offset, total }) => {
        if (total === 0) return;
        // Past the last work means the letter has nothing; sit on the last page.
        const clamped = Math.min(offset, Math.max(total - 1, 0));
        const targetPage = Math.floor(clamped / search.pageSize) + 1;
        if (targetPage !== search.page) {
          handlePageChange(targetPage);
        }
        window.scrollTo({ top: 0 });
      })
      .finally(() => { setJumpingToLetter(null); });
  }, [search, handlePageChange]);


  // The table passes its updater straight through, which used to leave a
  // cross-page "select all N" standing: unchecking a row changed the visible
  // ticks while the bulk action still ran against every id, deleting the work
  // the user had just deselected.
  /**
   * Reconciles a standing cross-page selection with the ticks on this page.
   *
   * Discarding the whole set on any toggle was safe but destructive in its own
   * way: unticking one book out of "all 25" left 19 selected, silently losing
   * the five the user could not see. Every id on this page now follows its own
   * tick, and everything off it is left alone.
   */
  const reconcileAllWorkIds = useCallback(
    (next: RowSelectionState) => {
      setAllWorkIds((prev) => {
        if (prev === null) return null;
        const onPage = new Set(filteredByReading.map((w) => w.id));
        const chosen = new Set(prev.filter((id) => !onPage.has(id) || next[id] === true));
        for (const work of filteredByReading) {
          if (next[work.id] === true) chosen.add(work.id);
        }
        return [...chosen];
      });
    },
    [filteredByReading],
  );

  const handleRowSelectionChange = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);
      reconcileAllWorkIds(next);
    },
    [rowSelection, reconcileAllWorkIds],
  );

  const handleToggleGridSelect = useCallback((workId: string) => {
    const next: RowSelectionState = rowSelection[workId] === true
      ? Object.fromEntries(
          Object.entries(rowSelection).filter(([rowKey]) => rowKey !== workId),
        )
      : { ...rowSelection, [workId]: true };
    setRowSelection(next);
    reconcileAllWorkIds(next);
  }, [rowSelection, reconcileAllWorkIds]);

  const handleSelectModeChange = useCallback((on: boolean) => {
    setSelectMode(on);
    if (!on) {
      setRowSelection({});
      setAllWorkIds(null);
    }
  }, []);

  const handleEditModeToggle = useCallback(() => { setEditMode(!editMode); }, [editMode]);

  const handleDisplayViewChange = useCallback((v: LibraryView) => {
    setView(v);
    // Pages appended by the list's infinite scroll belong to the list. The
    // grid and the table are page-scoped - their pagination says "Page 1 of
    // N" and their select-all means "this page" - so carrying extra rows over
    // would make both of those lie.
    if (v !== "list") {
      appendGenerationRef.current += 1;
      setAppendedWorks([]);
      setLastLoadedPage(search.page);
    }
    // The select toggle is hidden in table view, so leaving select mode on
    // would strand the user in it when they come back to the grid.
    if (v === "table") {
      setSelectMode(false);
    }
    // Both the grid and the list render works, never editions.
    if (v !== "table" && isEditionsView) {
      handleViewModeChange("works");
    }
  }, [isEditionsView, handleViewModeChange, setView, search.page]);

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
          <h1 className="sr-only lg:not-sr-only lg:text-2xl lg:font-bold">Library</h1>
          {/* The strapline is 56px of a phone viewport, including its margins,
              and says nothing the heading does not. */}
          <p className="hidden text-muted-foreground lg:mb-6 lg:mt-2 lg:block">
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
        <div className="flex-1 min-w-0 space-y-3 lg:space-y-4">
          <LibraryToolbar
            leading={
              <LibraryFiltersSheet
                facetCounts={facetCounts}
                totalFacetCounts={totalFacetCounts}
                filters={currentFilters}
                onFiltersChange={handleFiltersChange}
                filterValue={readingFilter}
                onFilterChange={setReadingFilter}
                sortValue={view !== "table" ? search.sort : undefined}
                onSortChange={view !== "table" ? handleSortChange : undefined}
                searchValue={search.q ?? ""}
                onSearchChange={handleSearchChange}
              />
            }
            filtersInSheet
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
          {view === "list" ? (
            <div className="flex gap-1">
              <div className="min-w-0 flex-1">
                <LibraryList
                  works={filteredByReading}
                  progressMap={progressMap}
                  selectable={selectMode}
                  selectionActive={selectedCount > 0}
                  rowSelection={rowSelection}
                  onToggleSelect={handleToggleGridSelect}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={handleLoadMore}
                />
              </div>
              {/* Only a title sort has an alphabet to scrub. */}
              {(search.sort === "title-asc" || search.sort === "title-desc") && (
                <AlphabetScrubber onJump={handleJumpToLetter} pending={jumpingToLetter} />
              )}
            </div>
          ) : view === "grid" ? (
            <LibraryGrid
              works={filteredByReading}
              progressMap={progressMap}
              scanActive={isScanning}
              tileSize={tileSize}
              selectable={selectMode}
              selectionActive={selectedCount > 0}
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
              // Editions view has no bulk actions: the toolbar acts on work
              // ids, and these rows are editions. Passing a selection state
              // here rendered a column of checkboxes that could never tick, so
              // both props are omitted.
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
              onRowSelectionChange={handleRowSelectionChange}
              sorting={tableSorting}
              onSortingChange={handleColumnSort}
              viewMode="works"
              onViewModeChange={handleViewModeChange}
              columnPickerItems={COLUMN_PICKER_ITEMS}
            />
          )}
          <LibraryPagination
            // The bulk bar is fixed over this corner while anything is
            // selected, and would swallow taps meant for the page controls.
            // The list loads the next page as you reach it, so page controls
            // there would fight the scroll rather than help it.
            hidden={selectedCount > 0 || view === "list"}
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
