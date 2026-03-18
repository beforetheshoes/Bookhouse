import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getLibraryWorksServerFn,
  type LibraryWork,
} from "~/lib/server-fns/library";
import { getActiveJobCountServerFn } from "~/lib/server-fns/import-jobs";

export const Route = createFileRoute("/_authenticated/library")({
  loader: async () => {
    const [works, activeJobCount] = await Promise.all([
      getLibraryWorksServerFn(),
      getActiveJobCountServerFn(),
    ]);
    return { works, activeJobCount };
  },
  pendingComponent: TablePageSkeleton,
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

const columns: ColumnDef<LibraryWork>[] = [
  {
    accessorKey: "titleDisplay",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
  },
  {
    id: "authors",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Author(s)" />
    ),
    accessorFn: (row) => getAuthors(row),
  },
  {
    id: "formats",
    header: "Format",
    cell: ({ row }) =>
      getFormats(row.original).map((f) => (
        <Badge key={f} variant="secondary" className="mr-1">
          {f}
        </Badge>
      )),
  },
  {
    id: "publisher",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Publisher" />
    ),
    accessorFn: (row) => row.editions[0]?.publisher ?? "—",
  },
  {
    id: "isbn",
    header: "ISBN",
    accessorFn: (row) =>
      row.editions[0]?.isbn13 ?? row.editions[0]?.isbn10 ?? "—",
  },
];

function LibraryPage() {
  const { works, activeJobCount } = Route.useLoaderData();
  const [prevCount, setPrevCount] = useState(works.length);

  const isScanning = activeJobCount > 0;
  const newCount = works.length - prevCount;

  useSSE({ enabled: isScanning });

  useEffect(() => {
    if (!isScanning) {
      setPrevCount(works.length);
    }
  }, [isScanning, works.length]);

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
              Scanning{newCount > 0 ? ` — ${newCount} new` : ""}...
            </span>
          </div>
        )}
      </div>
      <VirtualizedDataTable
        columns={columns}
        data={works}
        filterColumn="titleDisplay"
        filterPlaceholder="Filter by title..."
      />
    </div>
  );
}
