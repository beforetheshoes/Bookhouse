import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSSE } from "~/hooks/use-sse";
import { useLibraryViewPreference } from "~/hooks/use-library-view-preference";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, Loader2 } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { LibraryToolbar } from "~/components/library-toolbar";
import { LibraryGrid } from "~/components/library-grid";
import { sortAndFilterWorks, type SortOption, type ReadingFilter } from "~/lib/sort-filter-works";
import {
  getLibraryWorksServerFn,
  type LibraryWork,
} from "~/lib/server-fns/library";
import { getActiveJobCountServerFn } from "~/lib/server-fns/import-jobs";
import { getBulkReadingProgressServerFn } from "~/lib/server-fns/reading-progress";

export const Route = createFileRoute("/_authenticated/library")({
  loader: async () => {
    const [works, activeJobCount, progressMap] = await Promise.all([
      getLibraryWorksServerFn(),
      getActiveJobCountServerFn(),
      getBulkReadingProgressServerFn(),
    ]);
    return { works, activeJobCount, progressMap };
  },
  pendingComponent: GridPageSkeleton,
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
    cell: ({ row }) => (
      <Link to="/library/$workId" params={{ workId: row.original.id }} className="flex items-center gap-2">
        {row.original.titleDisplay}
        {row.original.enrichmentStatus === "STUB" && (
          <Badge variant="outline" className="animate-pulse px-1.5 py-0 text-[10px]">
            Processing&hellip;
          </Badge>
        )}
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
  const { works, activeJobCount, progressMap } = Route.useLoaderData();
  const [view, setView] = useLibraryViewPreference();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("title-asc");
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [prevCount, setPrevCount] = useState(works.length);

  const isScanning = activeJobCount > 0;
  const newCount = works.length - prevCount;

  useSSE({ enabled: isScanning });

  useEffect(() => {
    if (!isScanning) {
      setPrevCount(works.length);
    }
  }, [isScanning, works.length]);

  const filteredAndSorted = useMemo(
    () => sortAndFilterWorks(works, search, sort, readingFilter, progressMap),
    [works, search, sort, readingFilter, progressMap],
  );

  if (works.length === 0 && !isScanning) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Library</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="size-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">No works yet</h2>
          <p className="mt-2 text-muted-foreground">
            Add a library root in{" "}
            <Link to="/settings/libraries" className="underline">
              settings
            </Link>
            {" "}to start scanning your collection.
          </p>
        </div>
      </div>
    );
  }

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
              Scanning{newCount > 0 ? ` — ${String(newCount)} new` : ""}...
            </span>
          </div>
        )}
      </div>
      <div className="space-y-4">
        <LibraryToolbar
          searchValue={search}
          onSearchChange={setSearch}
          sortValue={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
          filterValue={readingFilter}
          onFilterChange={setReadingFilter}
        />
        {view === "grid" ? (
          <LibraryGrid works={filteredAndSorted} progressMap={progressMap} />
        ) : (
          <VirtualizedDataTable columns={columns} data={filteredAndSorted} />
        )}
      </div>
    </div>
  );
}
