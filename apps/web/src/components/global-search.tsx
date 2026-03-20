import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Search, User, BookMarked } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { useDebounce } from "~/hooks/use-debounce";
import { useRecentSearches } from "~/hooks/use-recent-searches";
import { searchLibraryServerFn, type SearchResult } from "~/lib/server-fns/search";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const debouncedQuery = useDebounce(query, 300);
  const { searches: recentSearches, addSearch } = useRecentSearches();

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }

    void searchLibraryServerFn({ data: { query: debouncedQuery } }).then(
      (data) => {
        setResults(data);
        addSearch(debouncedQuery);
      },
    );
  }, [debouncedQuery, addSearch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    },
    [],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
  }, []);

  const hasResults = results && (results.works.length > 0 || results.authors.length > 0 || results.series.length > 0);
  const showNoResults = results && !hasResults;
  const showRecent = !query.trim() && recentSearches.length > 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); }}
        aria-label="Search library"
        className="gap-2"
      >
        <Search className="size-4" />
        <span className="hidden text-muted-foreground sm:inline">Search...</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={() => { handleClose(); }}>
        <DialogContent className="gap-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Search Library</DialogTitle>
          <div className="flex items-center border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Search works, authors, series..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {showRecent && (
              <div className="space-y-1">
                <p className="px-2 text-xs font-medium text-muted-foreground">Recent Searches</p>
                {recentSearches.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setQuery(s); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Search className="size-3 text-muted-foreground" />
                    {s}
                  </button>
                ))}
              </div>
            )}

            {showNoResults && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                No results found
              </p>
            )}

            {hasResults && (
              <div className="space-y-4">
                {results.works.length > 0 && (
                  <ResultGroup title="Works" icon={<BookOpen className="size-3" />}>
                    {results.works.map((work) => (
                      <Link
                        key={work.id}
                        to="/library/$workId"
                        params={{ workId: work.id }}
                        search={{ page: 1, pageSize: 50, sort: "title-asc" as const }}
                        onClick={() => { handleClose(); }}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        {work.titleDisplay}
                        <Badge variant="secondary" className="ml-auto text-[10px]">Work</Badge>
                      </Link>
                    ))}
                  </ResultGroup>
                )}

                {results.authors.length > 0 && (
                  <ResultGroup title="Authors" icon={<User className="size-3" />}>
                    {results.authors.map((author) => (
                      <Link
                        key={author.id}
                        to="/authors/$authorId"
                        params={{ authorId: author.id }}
                        onClick={() => { handleClose(); }}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        {author.nameDisplay}
                        <Badge variant="secondary" className="ml-auto text-[10px]">Author</Badge>
                      </Link>
                    ))}
                  </ResultGroup>
                )}

                {results.series.length > 0 && (
                  <ResultGroup title="Series" icon={<BookMarked className="size-3" />}>
                    {results.series.map((s) => (
                      <Link
                        key={s.id}
                        to="/series/$seriesId"
                        params={{ seriesId: s.id }}
                        onClick={() => { handleClose(); }}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        {s.name}
                        <Badge variant="secondary" className="ml-auto text-[10px]">Series</Badge>
                      </Link>
                    ))}
                  </ResultGroup>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}
