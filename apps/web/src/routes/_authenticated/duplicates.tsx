import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import {
  getDuplicatesServerFn,
  type DuplicateRow,
} from "~/lib/server-fns/duplicates";

export const Route = createFileRoute("/_authenticated/duplicates")({
  loader: async () => {
    const duplicates = await getDuplicatesServerFn();
    return { duplicates };
  },
  component: DuplicatesPage,
});

function getItemLabel(row: DuplicateRow, side: "left" | "right"): string {
  const edition =
    side === "left" ? row.leftEdition : row.rightEdition;
  const file =
    side === "left" ? row.leftFileAsset : row.rightFileAsset;

  if (edition) return edition.work.titleDisplay;
  if (file) return file.basename;
  return "—";
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  IGNORED: "secondary",
  CONFIRMED: "default",
  MERGED: "default",
};

const columns: ColumnDef<DuplicateRow>[] = [
  {
    id: "leftItem",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Left Item" />
    ),
    accessorFn: (row) => getItemLabel(row, "left"),
  },
  {
    id: "rightItem",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Right Item" />
    ),
    accessorFn: (row) => getItemLabel(row, "right"),
  },
  {
    accessorKey: "reason",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reason" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.reason}</Badge>
    ),
  },
  {
    accessorKey: "confidence",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Confidence" />
    ),
    cell: ({ row }) => {
      const val = row.original.confidence;
      return val != null ? `${Math.round(val * 100)}%` : "—";
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status] ?? "outline"}>
        {row.original.status}
      </Badge>
    ),
  },
];

function DuplicatesPage() {
  const { duplicates } = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-2xl font-bold">Duplicates</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Review and resolve duplicate candidates.
      </p>
      <DataTable
        columns={columns}
        data={duplicates}
        filterColumn="leftItem"
        filterPlaceholder="Filter by title..."
      />
    </div>
  );
}
