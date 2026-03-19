import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getAudioLinksServerFn,
  type AudioLinkRow,
} from "~/lib/server-fns/audio-links";

export const Route = createFileRoute("/_authenticated/audio-links")({
  loader: async () => {
    const audioLinks = await getAudioLinksServerFn();
    return { audioLinks };
  },
  pendingComponent: TablePageSkeleton,
  component: AudioLinksPage,
});

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  IGNORED: "secondary",
  CONFIRMED: "default",
  MERGED: "default",
};

const columns: ColumnDef<AudioLinkRow>[] = [
  {
    id: "ebookTitle",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ebook Title" />
    ),
    accessorFn: (row) => row.ebookEdition.work.titleDisplay,
  },
  {
    id: "audioTitle",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Audio Title" />
    ),
    accessorFn: (row) => row.audioEdition.work.titleDisplay,
  },
  {
    accessorKey: "matchType",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Match Type" />
    ),
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.matchType}</Badge>
    ),
  },
  {
    accessorKey: "confidence",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Confidence" />
    ),
    cell: ({ row }) => {
      const val = row.original.confidence;
      return val != null ? `${String(Math.round(val * 100))}%` : "—";
    },
  },
  {
    accessorKey: "reviewStatus",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.reviewStatus] ?? "outline"}>
        {row.original.reviewStatus}
      </Badge>
    ),
  },
];

function AudioLinksPage() {
  const { audioLinks } = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-2xl font-bold">Audio Links</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Review ebook-to-audiobook matches.
      </p>
      <DataTable
        columns={columns}
        data={audioLinks}
        filterColumn="ebookTitle"
        filterPlaceholder="Filter by ebook title..."
      />
    </div>
  );
}
