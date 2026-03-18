import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getLibraryWorksServerFn,
  type LibraryWork,
} from "~/lib/server-fns/library";

export const Route = createFileRoute("/_authenticated/library")({
  loader: async () => {
    const works = await getLibraryWorksServerFn();
    return { works };
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
  const { works } = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-2xl font-bold">Library</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Browse and manage your works.
      </p>
      <VirtualizedDataTable
        columns={columns}
        data={works}
        filterColumn="titleDisplay"
        filterPlaceholder="Filter by title..."
      />
    </div>
  );
}
