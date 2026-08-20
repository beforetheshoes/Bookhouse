import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { LibraryGrid } from "~/components/library-grid";
import { LibraryToolbar } from "~/components/library-toolbar";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { useEffectiveLibraryView } from "~/hooks/use-library-view-preference";
import { useGridTileSize } from "~/hooks/use-grid-tile-size";
import {
  getShelfDetailServerFn,
  getAvailableEditionsServerFn,
  addEditionToShelfServerFn,
  removeEditionFromShelfServerFn,
  removeWorkEditionsFromShelfServerFn,
  type ShelfDetail,
  type AvailableEdition,
} from "~/lib/server-fns/shelves";
import type { SortValue } from "~/components/library-toolbar";
import type { ReadingFilter } from "~/lib/sort-filter-works";
import { FloatingActionBar } from "~/components/floating-action-bar";

export const Route = createFileRoute("/_authenticated/shelves/$shelfId")({
  loader: async ({ params }) => {
    const shelf = await getShelfDetailServerFn({
      data: { shelfId: params.shelfId },
    });
    return { shelf };
  },
  pendingComponent: GridPageSkeleton,
  component: ShelfDetailPage,
});

export type ShelfEdition = ShelfDetail["items"][number]["edition"];

type WorkWithEditions = ShelfEdition["work"] & { editions: ShelfEdition[] };

function getWorksWithEditions(items: ShelfDetail["items"]): WorkWithEditions[] {
  const workMap = new Map<string, WorkWithEditions>();
  for (const item of items) {
    const existing = workMap.get(item.edition.work.id);
    if (existing) {
      existing.editions.push(item.edition);
    } else {
      workMap.set(item.edition.work.id, {
        ...item.edition.work,
        editions: [item.edition],
      });
    }
  }
  return [...workMap.values()];
}

export function getAuthors(edition: ShelfEdition): string {
  const authors = edition.contributors
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ");
}

export function getTableColumns(): ColumnDef<ShelfEdition>[] {
  return [
    {
      id: "select",
      size: 40,
      maxSize: 40,
      header: ({ table }) => (
          <input
            type="checkbox"
            className="size-5 lg:size-4"
          checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => { table.toggleAllPageRowsSelected(e.target.checked); }}
            aria-label="Select all"
          />
      ),
      cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-5 lg:size-4"
          checked={row.getIsSelected()}
            onChange={(e) => { row.toggleSelected(e.target.checked); }}
            aria-label="Select row"
          />
      ),
      enableSorting: false,
    },
    {
      id: "titleDisplay",
      size: 300,
      accessorFn: (row) => row.work.titleDisplay,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <Link to="/library/$workId" params={{ workId: row.original.work.id }} className="flex min-h-9 items-center font-medium hover:underline lg:min-h-0">
          {row.original.work.titleDisplay}
        </Link>
      ),
    },
    {
      id: "format",
      size: 100,
      maxSize: 100,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Format" />,
      accessorFn: (row) => row.formatFamily,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs">{row.original.formatFamily}</Badge>
      ),
    },
    {
      id: "authors",
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Author" />,
      accessorFn: (row) => getAuthors(row),
    },
    {
      id: "publisher",
      size: 150,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Publisher" />,
      accessorFn: (row) => row.publisher ?? "",
    },
    {
      id: "isbn",
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title="ISBN" />,
      accessorFn: (row) => row.isbn13 ?? row.isbn10 ?? "",
    },
    {
      id: "series",
      size: 150,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Series" />,
      accessorFn: (row) => row.work.series?.name ?? "",
    },
  ];
}

function ShelfDetailPage() {
  const { shelf } = Route.useLoaderData();
  const router = useRouter();
  const [view, setView] = useEffectiveLibraryView();
  const [tileSize, setTileSize] = useGridTileSize();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sortValue, setSortValue] = useState<SortValue>("title-asc");
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [, setToolbarSearch] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectMode, setSelectMode] = useState(false);
  // The grid shows works, the table shows editions, so their selections are
  // not interchangeable and are kept apart.
  const [gridSelection, setGridSelection] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState(false);

  const editions = shelf.items.map((item) => item.edition);
  const works = getWorksWithEditions(shelf.items);


  // Keyed by edition id via getRowId, so a refreshed list cannot repoint it.
  // Still filtered against the current list: a selected row can disappear.
  const selectedEditionIds = useMemo(() => {
    const present = new Set(editions.map((e) => e.id));
    return Object.keys(rowSelection).filter((id) => present.has(id));
  }, [rowSelection, editions]);

  // Derived from the filtered ids, not the raw keys: a selected edition can
  // leave the list, and a bar that counts what the mutation will not act on
  // is lying.
  const selectedCount = selectedEditionIds.length;

  const gridSelectedWorkIds = useMemo(() => {
    const present = new Set(works.map((w) => w.id));
    return Object.keys(gridSelection).filter((id) => present.has(id));
  }, [gridSelection, works]);

  const handleToggleGridSelect = useCallback((workId: string) => {
    setGridSelection((prev) => {
      if (prev[workId] === true) {
        return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== workId));
      }
      return { ...prev, [workId]: true };
    });
  }, []);

  const handleSelectModeChange = useCallback((on: boolean) => {
    setSelectMode(on);
    if (!on) setGridSelection({});
  }, []);

  const handleRemoveSelectedWorks = async () => {
    setRemoving(true);
    try {
      for (const workId of gridSelectedWorkIds) {
        await removeWorkEditionsFromShelfServerFn({ data: { shelfId: shelf.id, workId } });
      }
      const n = gridSelectedWorkIds.length;
      toast.success(`Removed ${String(n)} work${n === 1 ? "" : "s"} from shelf`);
      setGridSelection({});
    } catch {
      toast.error("Failed to remove editions");
    } finally {
      setRemoving(false);
      // In the finally: a partial failure has already committed earlier
      // removals, so the list must refresh either way or the bar keeps
      // counting rows that no longer exist.
      void router.invalidate();
    }
  };

  const handleRemoveSelected = async () => {
    setRemoving(true);
    try {
      for (const editionId of selectedEditionIds) {
        await removeEditionFromShelfServerFn({ data: { shelfId: shelf.id, editionId } });
      }
      const n = selectedEditionIds.length;
      toast.success(`Removed ${String(n)} edition${n === 1 ? "" : "s"} from shelf`);
      setRowSelection({});
    } catch {
      toast.error("Failed to remove editions");
    } finally {
      setRemoving(false);
      void router.invalidate();
    }
  };

  const tableColumns = useMemo(() => getTableColumns(), []);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/shelves" className="flex min-h-9 shrink-0 items-center hover:text-foreground lg:min-h-0">
          Shelves
        </Link>
        <ChevronRight className="size-4" />
        <span className="min-w-0 [overflow-wrap:anywhere] text-foreground">{shelf.name}</span>
      </nav>

      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-bold [overflow-wrap:anywhere]">{shelf.name}</h1>
          <Badge variant="secondary" data-testid="shelf-format-badge">
            {shelf.formatFilter === "ALL" ? "All Formats" : shelf.formatFilter === "EBOOK" ? "Ebooks" : "Audiobooks"}
          </Badge>
        </div>
        <Button
          onClick={() => { setAddDialogOpen(true); }}
          data-testid="add-editions-btn"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Books
        </Button>
      </div>

      <LibraryToolbar
        searchValue=""
        onSearchChange={setToolbarSearch}
        sortValue={sortValue}
        onSortChange={setSortValue}
        view={view}
        onViewChange={setView}
        filterValue={readingFilter}
        onFilterChange={setReadingFilter}
        showSort={view !== "table"}
        selectMode={selectMode}
        onSelectModeChange={handleSelectModeChange}
        tileSize={tileSize}
        onTileSizeChange={setTileSize}
      />

      {editions.length === 0 ? (
        <p className="text-muted-foreground">No editions on this shelf yet.</p>
      ) : view === "grid" ? (
        <LibraryGrid
          works={works}
          tileSize={tileSize}
          selectable={selectMode}
          selectionActive={gridSelectedWorkIds.length > 0}
          rowSelection={gridSelection}
          onToggleSelect={handleToggleGridSelect}
        />
      ) : (
        <VirtualizedDataTable
          columns={tableColumns}
          data={editions}
          getRowId={(row) => (row as { id: string }).id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {(view === "grid" ? gridSelectedWorkIds.length : selectedCount) > 0 && (
        <FloatingActionBar data-testid="selection-bar">
          <div className="flex w-full flex-wrap items-center justify-center gap-2 md:gap-3">
            <span className="text-sm font-medium">
              {view === "grid"
                ? `${String(gridSelectedWorkIds.length)} work${gridSelectedWorkIds.length === 1 ? "" : "s"} selected`
                : `${String(selectedCount)} edition${selectedCount === 1 ? "" : "s"} selected`}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { void (view === "grid" ? handleRemoveSelectedWorks() : handleRemoveSelected()); }}
              disabled={removing}
              data-testid="remove-selected-btn"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {removing ? "Removing..." : "Remove from Shelf"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setRowSelection({}); setGridSelection({}); }}>
              <X className="mr-1.5 size-3.5" />
              Clear
            </Button>
          </div>
        </FloatingActionBar>
      )}

      <AddEditionsDialog
        shelfId={shelf.id}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={() => { void router.invalidate(); }}
      />
    </div>
  );
}

export function editionLabel(edition: AvailableEdition): string {
  const authors = edition.contributors
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ");
}

function AddEditionsDialog({
  shelfId,
  open,
  onOpenChange,
  onAdded,
}: {
  shelfId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [available, setAvailable] = useState<AvailableEdition[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setFilter("");
      setLoading(true);
      void getAvailableEditionsServerFn({ data: { shelfId } })
        .then((editions) => { setAvailable(editions); })
        .catch(() => { setAvailable([]); })
        .finally(() => { setLoading(false); });
    }
  }, [open, shelfId]);

  const handleToggle = (editionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(editionId)) {
        next.delete(editionId);
      } else {
        next.add(editionId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      for (const editionId of selected) {
        await addEditionToShelfServerFn({ data: { shelfId, editionId } });
      }
      onOpenChange(false);
      onAdded();
    } finally {
      setAdding(false);
    }
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) return available;
    const q = filter.toLowerCase();
    return available.filter((e) =>
      e.work.titleDisplay.toLowerCase().includes(q) ||
      editionLabel(e).toLowerCase().includes(q),
    );
  }, [available, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Editions to Shelf</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Filter by title or author..."
          value={filter}
          onChange={(e) => { setFilter(e.target.value); }}
          data-testid="add-editions-filter"
        />

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1" data-testid="add-editions-list">
          {loading && <p className="text-sm text-muted-foreground p-2">Loading editions...</p>}

          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-2">No matching editions available.</p>
          )}

          {!loading && filtered.length > 0 && (
            <>
              <label className="flex items-center gap-2 rounded p-2 hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 lg:size-4"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={handleSelectAll}
                  data-testid="select-all-editions"
                />
                <span className="text-sm font-medium">Select all ({String(filtered.length)})</span>
              </label>

              {filtered.map((edition) => (
                <label
                  key={edition.id}
                  className="flex items-center gap-2 rounded p-2 hover:bg-muted cursor-pointer"
                  data-testid={`edition-row-${edition.id}`}
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 lg:size-4"
                    checked={selected.has(edition.id)}
                    onChange={() => { handleToggle(edition.id); }}
                    data-testid={`edition-check-${edition.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{edition.work.titleDisplay}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {editionLabel(edition)}
                      {edition.publisher ? ` · ${edition.publisher}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{edition.formatFamily}</Badge>
                </label>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            onClick={() => { void handleAdd(); }}
            disabled={adding || selected.size === 0}
            data-testid="add-selected-btn"
          >
            {adding ? "Adding..." : `Add ${String(selected.size)} Edition${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
