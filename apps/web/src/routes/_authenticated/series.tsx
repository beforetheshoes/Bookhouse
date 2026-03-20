import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import {
  getSeriesListServerFn,
  type SeriesListItem,
} from "~/lib/server-fns/series";

export const Route = createFileRoute("/_authenticated/series")({
  loader: async () => {
    const seriesList = await getSeriesListServerFn();
    return { seriesList };
  },
  pendingComponent: GridPageSkeleton,
  component: SeriesListPage,
});

function SeriesListPage() {
  const { seriesList } = Route.useLoaderData();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return seriesList;
    const q = search.toLowerCase();
    return seriesList.filter((s: SeriesListItem) =>
      s.name.toLowerCase().includes(q),
    );
  }, [seriesList, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Series</h1>
        <p className="mt-2 text-muted-foreground">
          Browse series in your library.
        </p>
      </div>

      <Input
        placeholder="Search series..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); }}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <BookOpen className="size-12" />
          <p className="mt-4">No series found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((series: SeriesListItem) => (
            <SeriesCard key={series.id} series={series} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeriesCard({ series }: { series: SeriesListItem }) {
  const coverWork = series.works[0];
  const hasCover = Boolean(coverWork?.coverPath);

  return (
    <Link
      to="/series/$seriesId"
      params={{ seriesId: series.id }}
      className="flex flex-col overflow-hidden rounded-lg border bg-card"
    >
      <div className="aspect-[2/3] bg-muted">
        {hasCover ? (
          <img
            src={`/api/covers/${series.id}/thumb`}
            alt={series.name}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div
            data-testid={`series-cover-placeholder-${series.id}`}
            className="flex size-full items-center justify-center text-muted-foreground"
          >
            <BookOpen className="size-12" />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">
          {series.name}
        </h3>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {series._count.works} {series._count.works === 1 ? "book" : "books"}
        </Badge>
      </div>
    </Link>
  );
}
