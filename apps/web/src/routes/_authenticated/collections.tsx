import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import {
  getCollectionsServerFn,
  type CollectionRow,
} from "~/lib/server-fns/collections";

export const Route = createFileRoute("/_authenticated/collections")({
  loader: async () => {
    const collections = await getCollectionsServerFn();
    return { collections };
  },
  component: CollectionsPage,
});

const columns: ColumnDef<CollectionRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.kind}</Badge>
    ),
  },
  {
    id: "itemCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Items" />
    ),
    accessorFn: (row) => row._count.items,
  },
];

function CollectionsPage() {
  const { collections } = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-2xl font-bold">Collections</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Manage your book collections.
      </p>
      <DataTable
        columns={columns}
        data={collections}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
      />
    </div>
  );
}
