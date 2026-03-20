import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Input } from "~/components/ui/input";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import {
  getAuthorsListServerFn,
  type AuthorListItem,
} from "~/lib/server-fns/authors";

export const Route = createFileRoute("/_authenticated/authors/")({
  loader: async () => {
    const authors = await getAuthorsListServerFn();
    return { authors };
  },
  pendingComponent: GridPageSkeleton,
  component: AuthorsListPage,
});

function AuthorsListPage() {
  const { authors } = Route.useLoaderData();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return authors;
    const q = search.toLowerCase();
    return authors.filter((a: AuthorListItem) =>
      a.nameDisplay.toLowerCase().includes(q),
    );
  }, [authors, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Authors</h1>
        <p className="mt-2 text-muted-foreground">
          Browse authors in your library.
        </p>
      </div>

      <Input
        placeholder="Search authors..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); }}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Users className="size-12" />
          <p className="mt-4">No authors found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((author: AuthorListItem) => (
            <Link
              key={author.id}
              to="/authors/$authorId"
              params={{ authorId: author.id }}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{author.nameDisplay}</p>
                <p className="text-xs text-muted-foreground">
                  {author.workCount} {author.workCount === 1 ? "work" : "works"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
