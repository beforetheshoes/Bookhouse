import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable, DataTableColumnHeader } from "~/components/data-table";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getShelvesServerFn,
  createShelfServerFn,
  renameShelfServerFn,
  deleteShelfServerFn,
  type ShelfRow,
} from "~/lib/server-fns/shelves";

export const Route = createFileRoute("/_authenticated/shelves/")({
  loader: async () => {
    const shelves = await getShelvesServerFn();
    return { shelves };
  },
  pendingComponent: TablePageSkeleton,
  component: ShelvesPage,
});

function ShelvesPage() {
  const { shelves } = Route.useLoaderData();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const columns: ColumnDef<ShelfRow>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <Link
          to="/shelves/$shelfId"
          params={{ shelfId: row.original.id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "itemCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Works" />
      ),
      accessorFn: (row) => row._count.items,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`actions-${row.original.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setRenameTarget({ id: row.original.id, name: row.original.name }); }}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => { setDeleteTarget({ id: row.original.id, name: row.original.name }); }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shelves</h1>
          <p className="mb-6 mt-2 text-muted-foreground">
            Organize your books into shelves.
          </p>
        </div>
        <Button onClick={() => { setCreateOpen(true); }} data-testid="create-shelf-btn">
          <Plus className="mr-2 h-4 w-4" />
          Create Shelf
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={shelves}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />

      <CreateShelfDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { void router.invalidate(); }}
      />

      <RenameShelfDialog
        open={renameTarget !== null}
        onOpenChange={() => { setRenameTarget(null); }}
        shelfId={renameTarget?.id ?? ""}
        currentName={renameTarget?.name ?? ""}
        onRenamed={() => {
          setRenameTarget(null);
          void router.invalidate();
        }}
      />

      <DeleteShelfDialog
        open={deleteTarget !== null}
        onOpenChange={() => { setDeleteTarget(null); }}
        shelfId={deleteTarget?.id ?? ""}
        shelfName={deleteTarget?.name ?? ""}
        onDeleted={() => {
          setDeleteTarget(null);
          void router.invalidate();
        }}
      />
    </div>
  );
}

function CreateShelfDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createShelfServerFn({ data: { name: name.trim() } });
      setName("");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Shelf</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Shelf name"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          data-testid="create-shelf-name"
        />
        <DialogFooter>
          <Button
            onClick={() => { void handleCreate(); }}
            disabled={saving || !name.trim()}
            data-testid="create-shelf-submit"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameShelfDialog({
  open,
  onOpenChange,
  shelfId,
  currentName,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shelfId: string;
  currentName: string;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const handleRename = async () => {
    setSaving(true);
    try {
      await renameShelfServerFn({ data: { shelfId, name: name.trim() } });
      onOpenChange(false);
      onRenamed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Shelf</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          data-testid="rename-shelf-name"
        />
        <DialogFooter>
          <Button
            onClick={() => { void handleRename(); }}
            disabled={saving || !name.trim()}
            data-testid="rename-shelf-submit"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteShelfDialog({
  open,
  onOpenChange,
  shelfId,
  shelfName,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shelfId: string;
  shelfName: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteShelfServerFn({ data: { shelfId } });
      onOpenChange(false);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Shelf</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete &quot;{shelfName}&quot;? This will remove all works from this shelf but won&apos;t delete the works themselves.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => { void handleDelete(); }}
            disabled={deleting}
            data-testid="delete-shelf-confirm"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
