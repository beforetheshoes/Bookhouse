import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { WorkCard } from "~/components/work-card";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { getAuthorDetailServerFn } from "~/lib/server-fns/authors";

export const Route = createFileRoute("/_authenticated/authors/$authorId")({
  loader: async ({ params }) => {
    const author = await getAuthorDetailServerFn({
      data: { authorId: params.authorId },
    });
    return { author };
  },
  pendingComponent: GridPageSkeleton,
  component: AuthorDetailPage,
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

function AuthorDetailPage() {
  const { author } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/authors" className="hover:text-foreground">
          Authors
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{author.nameDisplay}</span>
      </nav>

      <h1 className="text-2xl font-bold">{author.nameDisplay}</h1>

      {author.works.length === 0 ? (
        <p className="text-muted-foreground">No works by this author</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {author.works.map((work) => (
            <WorkCard
              key={work.id}
              id={work.id}
              title={work.titleDisplay}
              authors={getAuthors(work)}
              enrichmentStatus={work.enrichmentStatus}
              formats={getFormats(work)}
              series={work.series?.name}
              coverPath={work.coverPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
