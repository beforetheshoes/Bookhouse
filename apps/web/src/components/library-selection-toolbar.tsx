import { useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Loader2, Trash2, Wand2, X } from "lucide-react";
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
import { bulkAddToShelfServerFn } from "~/lib/server-fns/shelves";
import { BulkEnrichDialog } from "~/components/bulk-enrich-dialog";

interface LibrarySelectionToolbarProps {
  selectedCount: number;
  selectedWorkIds: string[];
  shelves: { id: string; name: string; _count: { items: number } }[];
  totalCount: number;
  allPageRowsSelected: boolean;
  onSelectAll: () => void;
  selectingAll: boolean;
  onDeleted: () => void;
  onAddedToShelf: () => void;
  onEnrichStarted: () => void;
  onClearSelection: () => void;
}

export function LibrarySelectionToolbar({
  selectedCount,
  selectedWorkIds,
  shelves,
  totalCount,
  allPageRowsSelected,
  onSelectAll,
  selectingAll,
  onDeleted,
  onAddedToShelf,
  onEnrichStarted,
  onClearSelection,
}: LibrarySelectionToolbarProps) {
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [addToShelfOpen, setAddToShelfOpen] = useState(false);
  const [addingToShelf, setAddingToShelf] = useState(false);
  const [bulkEnrichOpen, setBulkEnrichOpen] = useState(false);

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
        <Button variant="destructive" size="sm" onClick={() => { setBulkDeleteOpen(true); }}>
          <Trash2 className="mr-1.5 size-3.5" />
          Delete Selected
        </Button>
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
            <Button variant="destructive" onClick={() => { void handleBulkDelete(); }} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : "Delete"}
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
    </>
  );
}
