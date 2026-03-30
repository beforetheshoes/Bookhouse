import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, Search, X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { LibraryGrid } from "~/components/library-grid";
import { LibraryToolbar } from "~/components/library-toolbar";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { useLibraryViewPreference } from "~/hooks/use-library-view-preference";
import { useGridTileSize } from "~/hooks/use-grid-tile-size";
import {
  getShelfDetailServerFn,
  addEditionsForWorkToShelfServerFn,
  type ShelfDetail,
} from "~/lib/server-fns/shelves";
import { searchLibraryServerFn } from "~/lib/server-fns/search";
import type { SortValue } from "~/components/library-toolbar";
import type { ReadingFilter } from "~/lib/sort-filter-works";

export const Route = createFileRoute("/_authenticated/shelves/$shelfId")({
  loader: async ({ params }) => {
    const shelf = await getShelfDetailServerFn({
      data: { shelfId: params.shelfId },
    });
    return { shelf };
  },
  pendingComponent: GridPageSkeleton,
  component: ShelfDetailPage,
});

type ShelfEdition = ShelfDetail["items"][number]["edition"];

type WorkWithEditions = ShelfEdition["work"] & { editions: ShelfEdition[] };

function getWorksWithEditions(items: ShelfDetail["items"]): WorkWithEditions[] {
  const workMap = new Map<string, WorkWithEditions>();
  for (const item of items) {
    const existing = workMap.get(item.edition.work.id);
    if (existing) {
      existing.editions.push(item.edition);
    } else {
      workMap.set(item.edition.work.id, {
        ...item.edition.work,
        editions: [item.edition],
      });
    }
  }
  return [...workMap.values()];
}

/* c8 ignore start -- column cell renderers require real table virtualization, tested via library.index */
function getAuthors(edition: ShelfEdition): string {
  const authors = edition.contributors
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ");
}

const tableColumns: ColumnDef<ShelfEdition>[] = [
  {
    id: "titleDisplay",
    accessorFn: (row) => row.work.titleDisplay,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => (
      <Link to="/library/$workId" params={{ workId: row.original.work.id }} className="font-medium hover:underline">
        {row.original.work.titleDisplay}
      </Link>
    ),
  },
  {
    id: "format",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Format" />,
    accessorFn: (row) => row.formatFamily,
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-xs">{row.original.formatFamily}</Badge>
    ),
  },
  {
    id: "authors",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Author" />,
    accessorFn: (row) => getAuthors(row),
  },
  {
    id: "publisher",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Publisher" />,
    accessorFn: (row) => row.publisher ?? "",
  },
  {
    id: "isbn",
    header: ({ column }) => <DataTableColumnHeader column={column} title="ISBN" />,
    accessorFn: (row) => row.isbn13 ?? row.isbn10 ?? "",
  },
  {
    id: "series",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Series" />,
    accessorFn: (row) => row.work.series?.name ?? "",
  },
];
/* c8 ignore stop */

function ShelfDetailPage() {
  const { shelf } = Route.useLoaderData();
  const router = useRouter();
  const [view, setView] = useLibraryViewPreference();
  const [tileSize, setTileSize] = useGridTileSize();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Awaited<ReturnType<typeof searchLibraryServerFn>>["works"]
  >([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sortValue, setSortValue] = useState<SortValue>("title-asc");
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>("all");
  const [, setToolbarSearch] = useState("");

  const editions = shelf.items.map((item) => item.edition);
  const works = getWorksWithEditions(shelf.items);
  const memberWorkIds = new Set(works.map((w) => w.id));

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchLibraryServerFn({ data: { query } });
      setSearchResults(results.works);
    } finally {
      setSearching(false);
    }
  };

  const handleAddWork = async (workId: string) => {
    await addEditionsForWorkToShelfServerFn({ data: { shelfId: shelf.id, workId } });
    setSearchQuery("");
    setSearchResults([]);
    void router.invalidate();
  };

  const filteredResults = searchResults.filter((r) => !memberWorkIds.has(r.id));

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/shelves" className="hover:text-foreground">
          Shelves
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{shelf.name}</span>
      </nav>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{shelf.name}</h1>
          <Badge variant="secondary" data-testid="shelf-format-badge">
            {shelf.formatFilter === "ALL" ? "All Formats" : shelf.formatFilter === "EBOOK" ? "Ebooks" : "Audiobooks"}
          </Badge>
        </div>
        <Button
          variant="outline"
          onClick={() => { setShowSearch(!showSearch); }}
          data-testid="toggle-add-works"
        >
          {showSearch ? <X className="mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
          {showSearch ? "Done" : "Add Works"}
        </Button>
      </div>

      {showSearch && (
        <div className="space-y-3 rounded-md border p-4" data-testid="add-works-panel">
          <Input
            placeholder="Search by title or author..."
            value={searchQuery}
            onChange={(e) => { void handleSearch(e.target.value); }}
            data-testid="add-works-search"
          />
          {searching && (
            <p className="text-sm text-muted-foreground">Searching...</p>
          )}
          {filteredResults.length > 0 && (
            <div className="space-y-2">
              {filteredResults.map((work) => (
                <div
                  key={work.id}
                  className="flex items-center justify-between rounded-md border p-2"
                  data-testid="search-result"
                >
                  <div>
                    <p className="font-medium">{work.titleDisplay}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { void handleAddWork(work.id); }}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
          {searchQuery.trim().length >= 2 && !searching && filteredResults.length === 0 && (
            <p className="text-sm text-muted-foreground">No matching works found.</p>
          )}
        </div>
      )}

      <LibraryToolbar
        searchValue=""
        onSearchChange={setToolbarSearch}
        sortValue={sortValue}
        onSortChange={setSortValue}
        view={view}
        onViewChange={setView}
        filterValue={readingFilter}
        onFilterChange={setReadingFilter}
        showSort={view !== "table"}
        tileSize={tileSize}
        onTileSizeChange={setTileSize}
      />

      {editions.length === 0 ? (
        <p className="text-muted-foreground">No works on this shelf yet.</p>
      ) : view === "grid" ? (
        <LibraryGrid works={works} tileSize={tileSize} />
      ) : (
        <VirtualizedDataTable
          columns={tableColumns}
          data={editions}
          filterColumn="titleDisplay"
          filterPlaceholder="Filter by title..."
        />
      )}
    </div>
  );
}
