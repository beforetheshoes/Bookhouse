import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader } from "~/components/data-table";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "~/components/ui/popover";
import {
  getSeriesListServerFn,
  type SeriesListItem,
} from "~/lib/server-fns/series";

export const Route = createFileRoute("/_authenticated/series/")({
  loader: async () => {
    const seriesList = await getSeriesListServerFn();
    return { seriesList };
  },
  pendingComponent: TablePageSkeleton,
  component: SeriesListPage,
});

function getAuthors(series: SeriesListItem): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const work of series.works) {
    for (const edition of work.editions) {
      for (const c of edition.contributors) {
        if (c.role === "AUTHOR" && !seen.has(c.contributor.nameDisplay)) {
          seen.add(c.contributor.nameDisplay);
          names.push(c.contributor.nameDisplay);
        }
      }
    }
  }
  return names.join(", ") || "—";
}

const columns: ColumnDef<SeriesListItem>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <Link
        to="/series/$seriesId"
        params={{ seriesId: row.original.id }}
        className="hover:underline"
      >
        {row.original.name}
      </Link>
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
    id: "books",
    header: () => <span className="text-sm font-medium">Books</span>,
    cell: ({ row }) => {
      const works = row.original.works;
      const count = row.original._count.works;
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button className="hover:underline">{count}</button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <ul className="space-y-1.5">
              {works.map((work) => (
                <li key={work.id}>
                  <Link
                    to="/library/$workId"
                    params={{ workId: work.id }}
                    className="text-sm hover:underline"
                  >
                    {work.seriesPosition != null
                      ? `${String(work.seriesPosition)}. ${work.titleDisplay}`
                      : work.titleDisplay}
                  </Link>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      );
    },
  },
];

function SeriesListPage() {
  const { seriesList } = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-2xl font-bold">Series</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Browse series in your library.
      </p>
      <DataTable
        columns={columns}
        data={seriesList}
        filterColumn="name"
        filterPlaceholder="Filter series..."
      />
    </div>
  );
}
