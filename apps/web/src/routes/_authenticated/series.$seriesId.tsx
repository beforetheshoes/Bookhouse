import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { WorkCard } from "~/components/work-card";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { getSeriesDetailServerFn } from "~/lib/server-fns/series";

export const Route = createFileRoute("/_authenticated/series/$seriesId")({
  loader: async ({ params }) => {
    const series = await getSeriesDetailServerFn({
      data: { seriesId: params.seriesId },
    });
    return { series };
  },
  pendingComponent: GridPageSkeleton,
  component: SeriesDetailPage,
});

function getAuthors(work: { editions: { contributors: { role: string; contributor: { nameDisplay: string } }[] }[] }): string {
  const authors = work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ") || "—";
}

function getFormats(work: { editions: { formatFamily: string }[] }): string[] {
  return [...new Set(work.editions.map((e) => e.formatFamily))];
}

function SeriesDetailPage() {
  const { series } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/series" className="hover:text-foreground">
          Series
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{series.name}</span>
      </nav>

      <h1 className="text-2xl font-bold">{series.name}</h1>

      {series.works.length === 0 ? (
        <p className="text-muted-foreground">No works in this series</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {series.works.map((work) => (
            <div key={work.id} className="space-y-1">
              {work.seriesPosition != null && (
                <Badge variant="outline" className="mb-1 text-xs">
                  #{String(work.seriesPosition)}
                </Badge>
              )}
              <WorkCard
                id={work.id}
                title={work.titleDisplay}
                authors={getAuthors(work)}
                enrichmentStatus={work.enrichmentStatus}
                formats={getFormats(work)}
                series={work.series?.name}
                coverPath={work.coverPath}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
