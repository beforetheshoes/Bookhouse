import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSSE } from "~/hooks/use-sse";
import { useLibraryViewPreference } from "~/hooks/use-library-view-preference";
import { useLibraryTablePreferences } from "~/hooks/use-library-table-preferences";
import type { ColumnDef, RowSelectionState, SortingState, Updater } from "@tanstack/react-table";
import { AlignJustify, BookOpen, Loader2, Pencil, Trash2, WrapText, X } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { DataTableColumnPicker } from "~/components/data-table/data-table-column-picker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { bulkDeleteWorksServerFn } from "~/lib/server-fns/deletion";
import { EditableTableCell } from "~/components/editable-table-cell";
import { updateWorkServerFn, updateEditionServerFn, updateWorkAuthorsServerFn } from "~/lib/server-fns/editing";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { LibraryToolbar } from "~/components/library-toolbar";
import { LibraryGrid } from "~/components/library-grid";
import { LibraryFilters, type LibraryFilterValues } from "~/components/library-filters";
import { LibraryPagination } from "~/components/library-pagination";
import { librarySearchSchema, type LibrarySearchParams } from "~/lib/library-search-schema";
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

function getColumns(scanActive: boolean, editMode: boolean, router: { invalidate: () => void }): ColumnDef<LibraryWork>[] {
  return [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => { table.toggleAllPageRowsSelected(e.target.checked); }}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => { row.toggleSelected(e.target.checked); }}
        aria-label="Select row"
      />
    ),
    size: 40,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "titleDisplay",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => {
      if (editMode) {
        return (
          <EditableTableCell
            value={row.original.titleDisplay}
            editing={true}
            onSave={async (val) => {
              await updateWorkServerFn({ data: { workId: row.original.id, fields: { titleDisplay: val } } });
              router.invalidate();
            }}
          />
        );
      }
      return (
        <Link to="/library/$workId" params={{ workId: row.original.id }} search={{ page: 1, pageSize: 50, sort: "title-asc" as const }} className="flex items-center gap-2">
          {row.original.titleDisplay}
          {row.original.enrichmentStatus === "STUB" && scanActive && (
            <Badge variant="outline" className="animate-pulse px-1.5 py-0 text-[10px]">
              Processing&hellip;
            </Badge>
          )}
        </Link>
      );
    },
    size: 300,
    enableHiding: false,
  },
  {
    id: "authors",
    accessorFn: (row) => getAuthors(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Author(s)" />
    ),
    cell: ({ row }) => {
      const authorsStr = getAuthors(row.original);
      if (editMode) {
        return (
          <EditableTableCell
            value={authorsStr === "—" ? "" : authorsStr}
            editing={true}
            onSave={async (val) => {
              const authors = val.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
              if (authors.length === 0) return;
              await updateWorkAuthorsServerFn({ data: { workId: row.original.id, authors } });
              router.invalidate();
            }}
          />
        );
      }
      return <span>{authorsStr}</span>;
    },
    size: 200,
  },
  {
    id: "formats",
    accessorFn: (row) => getFormats(row).join(", "),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Format" />
    ),
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
    accessorFn: (row) => row.editions[0]?.publisher ?? "",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Publisher" />
    ),
    cell: ({ row }) => {
      const pub = row.original.editions[0]?.publisher ?? "";
      const editionId = row.original.editions[0]?.id;
      if (editMode && editionId) {
        return (
          <EditableTableCell
            value={pub}
            editing={true}
            onSave={async (val) => {
              await updateEditionServerFn({ data: { editionId, fields: { publisher: val || null } } });
              router.invalidate();
            }}
          />
        );
      }
      return <span>{pub || "—"}</span>;
    },
    size: 150,
  },
  {
    id: "isbn",
    accessorFn: (row) => row.editions[0]?.isbn13 ?? row.editions[0]?.isbn10 ?? "",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ISBN" />
    ),
    cell: ({ row }) => {
      const isbn = row.original.editions[0]?.isbn13 ?? row.original.editions[0]?.isbn10 ?? "";
      const editionId = row.original.editions[0]?.id;
      if (editMode && editionId) {
        return (
          <EditableTableCell
            value={isbn}
            editing={true}
            onSave={async (val) => {
              await updateEditionServerFn({ data: { editionId, fields: { isbn13: val || null } } });
              router.invalidate();
            }}
          />
        );
      }
      return <span>{isbn || "—"}</span>;
    },
    size: 120,
  },
  ];
}

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

function LibraryPage() {
  const { libraryResult, activeJobCount, progressMap } = Route.useLoaderData();
  const { works, totalCount, facetCounts, totalFacetCounts } = libraryResult;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [view, setView] = useLibraryViewPreference();
  const [tablePrefs, setTablePrefs] = useLibraryTablePreferences();
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [prevCount, setPrevCount] = useState(totalCount);

  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const isScanning = activeJobCount > 0;
  const newCount = totalCount - prevCount;
  const selectedCount = Object.keys(rowSelection).length;

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      await bulkDeleteWorksServerFn({ data: { workIds: selectedWorkIds } });
      toast.success(`${String(selectedWorkIds.length)} work${selectedWorkIds.length === 1 ? "" : "s"} deleted`);
      setRowSelection({});
      setBulkDeleteOpen(false);
      void router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete works");
    } finally {
      setBulkDeleting(false);
    }
  }

  useSSE();

  useEffect(() => {
    if (!isScanning) {
      setPrevCount(totalCount);
    }
  }, [isScanning, totalCount]);

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
        publisher: filters.publisher,
        hasCover: filters.hasCover,
        enriched: filters.enriched,
        hasDescription: filters.hasDescription,
        inSeries: filters.inSeries,
        hasIsbn: filters.hasIsbn,
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

  const COLUMN_SORT_MAP: Record<string, { asc: LibrarySearchParams["sort"]; desc: LibrarySearchParams["sort"] }> = useMemo(() => ({
    titleDisplay: { asc: "title-asc", desc: "title-desc" },
    authors: { asc: "author-asc", desc: "author-desc" },
    publisher: { asc: "publisher-asc", desc: "publisher-desc" },
    formats: { asc: "format-asc", desc: "format-desc" },
    isbn: { asc: "isbn-asc", desc: "isbn-desc" },
  }), []);

  const SORT_TO_COLUMN: Record<string, { id: string; desc: boolean }> = useMemo(() => ({
    "title-asc": { id: "titleDisplay", desc: false },
    "title-desc": { id: "titleDisplay", desc: true },
    "author-asc": { id: "authors", desc: false },
    "author-desc": { id: "authors", desc: true },
    "publisher-asc": { id: "publisher", desc: false },
    "publisher-desc": { id: "publisher", desc: true },
    "format-asc": { id: "formats", desc: false },
    "format-desc": { id: "formats", desc: true },
    "isbn-asc": { id: "isbn", desc: false },
    "isbn-desc": { id: "isbn", desc: true },
  }), []);

  const tableSorting: SortingState = useMemo(() => {
    const mapped = SORT_TO_COLUMN[search.sort];
    return mapped ? [mapped] : [];
  }, [search.sort, SORT_TO_COLUMN]);

  const handleColumnSort = useCallback(
    (updater: Updater<SortingState>) => {
      // TanStack Table always passes a function updater; cast is safe
      const newState = (updater as (prev: SortingState) => SortingState)(tableSorting);
      updateSearch({ sort: columnSortToParam(newState, COLUMN_SORT_MAP) });
    },
    [tableSorting, updateSearch, COLUMN_SORT_MAP],
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

  const selectedWorkIds = useMemo(() => {
    return Object.keys(rowSelection)
      .map((idx) => filteredByReading[Number(idx)]?.id)
      .filter((id): id is string => id !== undefined);
  }, [rowSelection, filteredByReading]);

  const currentFilters: LibraryFilterValues = {
    format: search.format,
    authorId: search.authorId,
    seriesId: search.seriesId,
    publisher: search.publisher,
    hasCover: search.hasCover,
    enriched: search.enriched,
    hasDescription: search.hasDescription,
    inSeries: search.inSeries,
    hasIsbn: search.hasIsbn,
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
          />
          {view === "table" && (
            <div className="flex items-center gap-2 justify-end">
              <Button
                data-testid="edit-mode-toggle"
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setEditMode(!editMode); }}
                aria-label={editMode ? "Exit edit mode" : "Enter edit mode"}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {editMode ? "Done" : "Edit"}
              </Button>
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
            <LibraryGrid works={filteredByReading} progressMap={progressMap} scanActive={isScanning} />
          ) : (
            <VirtualizedDataTable
              columns={getColumns(isScanning, editMode, router)}
              data={filteredByReading}
              showPagination={false}
              columnVisibility={tablePrefs.columnVisibility}
              textOverflow={tablePrefs.textOverflow}
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

      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-background p-3 shadow-lg">
          <span className="text-sm font-medium">{selectedCount} work{selectedCount === 1 ? "" : "s"} selected</span>
          <Button variant="destructive" size="sm" onClick={() => { setBulkDeleteOpen(true); }}>
            <Trash2 className="mr-1.5 size-3.5" />
            Delete Selected
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setRowSelection({}); }}>
            <X className="mr-1.5 size-3.5" />
            Clear
          </Button>
        </div>
      )}

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} Work{selectedCount === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              This will remove {selectedCount} work{selectedCount === 1 ? "" : "s"} and all {selectedCount === 1 ? "its" : "their"} editions from the library.
              The actual files on disk will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkDeleteOpen(false); }} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => { void handleBulkDelete(); }} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
