import { useState, useMemo } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ImagePlus, Loader2, Users } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AuthorAvatar } from "~/components/author-avatar";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { useSSE } from "~/hooks/use-sse";
import { runMutation } from "~/lib/mutation";
import {
  getAuthorsListServerFn,
  enrichAuthorPhotosServerFn,
  getEnrichAuthorPhotosProgressServerFn,
  type AuthorListItem,
} from "~/lib/server-fns/authors";

export const Route = createFileRoute("/_authenticated/authors/")({
  loader: async () => {
    const [authors, progress] = await Promise.all([
      getAuthorsListServerFn(),
      getEnrichAuthorPhotosProgressServerFn(),
    ]);
    return { authors, enrichingCount: progress.activeCount };
  },
  pendingComponent: GridPageSkeleton,
  component: AuthorsListPage,
});

function AuthorsListPage() {
  const { authors, enrichingCount } = Route.useLoaderData();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(false);

  const enriching = enrichingCount > 0;
  useSSE({ enabled: enriching });

  const filtered = useMemo(() => {
    if (!search) return authors;
    const q = search.toLowerCase();
    return authors.filter((a: AuthorListItem) =>
      a.nameDisplay.toLowerCase().includes(q),
    );
  }, [authors, search]);

  async function handleFetchPhotos() {
    setFetching(true);
    try {
      await runMutation(() => enrichAuthorPhotosServerFn(), {
        success: "Author photo enrichment started",
      });
      void router.invalidate();
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Authors</h1>
        <p className="mt-2 text-muted-foreground">
          Browse authors in your library.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search authors..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          className="max-w-sm"
        />
        <Button variant="outline" size="sm" disabled={fetching || enriching} onClick={() => { void handleFetchPhotos(); }}>
          {fetching ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Starting...
            </>
          ) : enriching ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Fetching Photos...
            </>
          ) : (
            <>
              <ImagePlus className="size-4" />
              Fetch Photos
            </>
          )}
        </Button>
      </div>

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
              <AuthorAvatar id={author.id} imagePath={author.imagePath} />
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
