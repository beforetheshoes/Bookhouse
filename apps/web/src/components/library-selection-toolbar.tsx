import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronDown, FolderOpen, GitMerge, Headphones, Loader2, Trash2, Wand2, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { bulkDeleteWorksServerFn, bulkDeleteEditionsByFormatForWorksServerFn, deleteAllEditionsByFormatServerFn } from "~/lib/server-fns/deletion";
import { bulkAddToShelfServerFn } from "~/lib/server-fns/shelves";
import { mergeWorksServerFn } from "~/lib/server-fns/work-management";
import { BulkEnrichDialog } from "~/components/bulk-enrich-dialog";

interface LibrarySelectionToolbarProps {
  selectedCount: number;
  selectedWorkIds: string[];
  selectedWorks: { id: string; title: string; editionCount: number }[];
  shelves: { id: string; name: string; _count: { items: number } }[];
  totalCount: number;
  allPageRowsSelected: boolean;
  onSelectAll: () => void;
  selectingAll: boolean;
  onDeleted: () => void;
  onMerged: () => void;
  onAddedToShelf: () => void;
  onEnrichStarted: () => void;
  onClearSelection: () => void;
}

export function LibrarySelectionToolbar({
  selectedCount,
  selectedWorkIds,
  selectedWorks,
  shelves,
  totalCount,
  allPageRowsSelected,
  onSelectAll,
  selectingAll,
  onDeleted,
  onMerged,
  onAddedToShelf,
  onEnrichStarted,
  onClearSelection,
}: LibrarySelectionToolbarProps) {
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteFormatMode, setDeleteFormatMode] = useState<"EBOOK" | "AUDIOBOOK" | null>(null);
  const [deletingByFormat, setDeletingByFormat] = useState(false);
  const [addToShelfOpen, setAddToShelfOpen] = useState(false);
  const [addingToShelf, setAddingToShelf] = useState(false);
  const [bulkEnrichOpen, setBulkEnrichOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [merging, setMerging] = useState(false);

  const defaultTargetId = selectedWorks.length > 0
    ? ([...selectedWorks].sort((a, b) => b.editionCount - a.editionCount)[0] as (typeof selectedWorks)[number]).id
    : "";
  const [mergeTargetId, setMergeTargetId] = useState(defaultTargetId);

  if (selectedCount === 0) return null;

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      await bulkDeleteWorksServerFn({ data: { workIds: selectedWorkIds } });
      toast.success(`${String(selectedWorkIds.length)} work${selectedWorkIds.length === 1 ? "" : "s"} deleted`);
      setBulkDeleteOpen(false);
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete works");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkDeleteByFormat(format: "EBOOK" | "AUDIOBOOK") {
    setDeletingByFormat(true);
    try {
      const result = selectedWorkIds.length > 100 || selectedCount >= totalCount
        ? await deleteAllEditionsByFormatServerFn({ data: { format } })
        : await bulkDeleteEditionsByFormatForWorksServerFn({ data: { workIds: selectedWorkIds, format } });
      const label = format === "EBOOK" ? "ebook" : "audiobook";
      const editionCount = result.deletedEditionIds.length;
      const workCount = result.deletedWorkIds.length;
      toast.success(
        `${String(editionCount)} ${label} edition${editionCount === 1 ? "" : "s"} deleted`
        + (workCount > 0 ? ` (${String(workCount)} work${workCount === 1 ? "" : "s"} removed)` : ""),
      );
      setDeleteFormatMode(null);
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete editions");
    } finally {
      setDeletingByFormat(false);
    }
  }

  async function handleAddToShelf(shelfId: string) {
    setAddingToShelf(true);
    try {
      const result = await bulkAddToShelfServerFn({ data: { shelfId, workIds: selectedWorkIds } });
      toast.success(`Added ${String(result.added)} to shelf`);
      setAddToShelfOpen(false);
      onAddedToShelf();
    } catch {
      toast.error("Failed to add to shelf");
    } finally {
      setAddingToShelf(false);
    }
  }

  async function handleMerge() {
    setMerging(true);
    try {
      const sourceWorkIds = selectedWorkIds.filter((id) => id !== mergeTargetId);
      await mergeWorksServerFn({ data: { targetWorkId: mergeTargetId, sourceWorkIds } });
      toast.success(`Merged ${String(selectedCount)} works`);
      setMergeOpen(false);
      onMerged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge works");
    } finally {
      setMerging(false);
    }
  }

  const otherFormat = deleteFormatMode === "EBOOK" ? "audiobook" : "ebook";
  const thisFormat = deleteFormatMode === "EBOOK" ? "ebook" : "audiobook";

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5 rounded-lg border bg-background p-3 shadow-lg">
        {allPageRowsSelected && selectedCount < totalCount && (
          <div className="text-xs text-muted-foreground" data-testid="select-all-banner">
            All {selectedCount} on this page selected.{" "}
            <button
              type="button"
              className="underline font-medium text-foreground hover:text-primary"
              onClick={onSelectAll}
              disabled={selectingAll}
              data-testid="select-all-btn"
            >
              {selectingAll ? (
                <><Loader2 className="inline size-3 animate-spin mr-0.5" />Selecting...</>
              ) : (
                `Select all ${String(totalCount)} works`
              )}
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{selectedCount} work{selectedCount === 1 ? "" : "s"} selected</span>
          <Button variant="outline" size="sm" onClick={() => { setAddToShelfOpen(true); }} data-testid="bulk-add-to-shelf-btn">
            <FolderOpen className="mr-1.5 size-3.5" />
            Add to Shelf
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setBulkEnrichOpen(true); }} data-testid="bulk-enrich-btn">
            <Wand2 className="mr-1.5 size-3.5" />
            Enrich Metadata
          </Button>
          {selectedCount >= 2 && (
            <Button variant="outline" size="sm" onClick={() => { setMergeTargetId(defaultTargetId); setMergeOpen(true); }} data-testid="merge-works-btn">
              <GitMerge className="mr-1.5 size-3.5" />
              Merge
            </Button>
          )}
          <div className="flex items-center">
            <Button
              variant="destructive"
              size="sm"
              className="rounded-r-none border-r border-destructive-foreground/20 pr-2.5"
              onClick={() => { setBulkDeleteOpen(true); }}
              data-testid="bulk-delete-works-btn"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Delete
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-l-none px-1.5"
                  aria-label="More delete options"
                  data-testid="bulk-delete-dropdown-trigger"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Delete by format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => { setDeleteFormatMode("EBOOK"); }}>
                    <BookOpen className="mr-2 size-4" />
                    Delete ebook editions only
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setDeleteFormatMode("AUDIOBOOK"); }}>
                    <Headphones className="mr-2 size-4" />
                    Delete audiobook editions only
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setBulkDeleteOpen(true); }}>
                    <Trash2 className="mr-2 size-4" />
                    Delete works (all editions)
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button variant="outline" size="sm" onClick={onClearSelection}>
            <X className="mr-1.5 size-3.5" />
            Clear
          </Button>
        </div>
      </div>

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
            <Button variant="destructive" onClick={() => { void handleBulkDelete(); }} disabled={bulkDeleting} data-testid="confirm-bulk-delete-works-btn">
              {bulkDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteFormatMode !== null} onOpenChange={() => { setDeleteFormatMode(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteFormatMode === "EBOOK" ? "Ebook" : "Audiobook"} Editions</DialogTitle>
            <DialogDescription>
              This will delete the {thisFormat} editions from {selectedCount} work{selectedCount === 1 ? "" : "s"}.
              Works that only have {thisFormat} editions will be removed entirely.
              Works with {otherFormat} editions will keep them.
              Files on disk will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteFormatMode(null); }} disabled={deletingByFormat}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { void handleBulkDeleteByFormat(deleteFormatMode as "EBOOK" | "AUDIOBOOK"); }}
              disabled={deletingByFormat}
              data-testid="confirm-delete-by-format-btn"
            >
              {deletingByFormat ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addToShelfOpen} onOpenChange={setAddToShelfOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selectedCount} Work{selectedCount === 1 ? "" : "s"} to Shelf</DialogTitle>
          </DialogHeader>
          <div className="space-y-2" data-testid="shelf-picker">
            {shelves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shelves created yet. Create one from the Shelves page.</p>
            ) : (
              shelves.map((shelf) => (
                <Button
                  key={shelf.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => { void handleAddToShelf(shelf.id); }}
                  disabled={addingToShelf}
                  data-testid={`shelf-pick-${shelf.id}`}
                >
                  <FolderOpen className="mr-2 size-4" />
                  {shelf.name}
                  <span className="ml-auto text-muted-foreground">{shelf._count.items} works</span>
                </Button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BulkEnrichDialog
        open={bulkEnrichOpen}
        onOpenChange={setBulkEnrichOpen}
        selectedCount={selectedCount}
        selectedWorkIds={selectedWorkIds}
        onStarted={() => {
          setBulkEnrichOpen(false);
          onEnrichStarted();
        }}
      />

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selectedCount} Work{selectedCount === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              All editions from the other works will be moved to the target work. The other works will be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedWorks.map((work) => (
              <label key={work.id} className="flex items-center gap-3 rounded-md border p-2 cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="merge-target"
                  value={work.id}
                  checked={mergeTargetId === work.id}
                  onChange={() => { setMergeTargetId(work.id); }}
                  disabled={merging}
                />
                <span className="flex-1 text-sm font-medium truncate">{work.title}</span>
                <span className="text-xs text-muted-foreground">{work.editionCount} edition{work.editionCount === 1 ? "" : "s"}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeOpen(false); }} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={() => { void handleMerge(); }} disabled={merging}>
              {merging ? "Merging..." : "Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
