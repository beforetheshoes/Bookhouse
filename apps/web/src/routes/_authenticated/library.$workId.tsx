import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  getWorkDetailServerFn,
  type WorkDetail,
} from "~/lib/server-fns/work-detail";

export const Route = createFileRoute("/_authenticated/library/$workId")({
  loader: async ({ params }) => {
    const work = await getWorkDetailServerFn({
      data: { workId: params.workId },
    });
    return { work };
  },
  pendingComponent: WorkDetailSkeleton,
  component: WorkDetailPage,
});

function WorkDetailSkeleton() {
  return (
    <div data-testid="work-detail-skeleton" className="space-y-6">
      <Skeleton className="h-6 w-48" />
      <div className="flex gap-8">
        <Skeleton className="h-72 w-48" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

function getAuthors(work: WorkDetail): string[] {
  const authors = work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)];
}

function formatBytes(bytes: bigint | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${String(n)} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function WorkDetailPage() {
  const { work } = Route.useLoaderData();
  const [imgFailed, setImgFailed] = useState(false);
  const showPlaceholder = !work.coverPath || imgFailed;
  const authors = getAuthors(work);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/library" className="hover:text-foreground">
          Library
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{work.titleDisplay}</span>
      </nav>

      <div className="flex gap-8">
        <div className="w-48 shrink-0">
          <div className="aspect-[2/3] overflow-hidden rounded-lg bg-muted">
            {showPlaceholder ? (
              <div data-testid="cover-placeholder" className="flex size-full items-center justify-center text-muted-foreground">
                <BookOpen className="size-12" />
              </div>
            ) : (
              <img
                src={`/api/covers/${work.id}/medium`}
                alt={work.titleDisplay}
                onError={() => { setImgFailed(true); }}
                className="size-full object-cover"
              />
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{work.titleDisplay}</h1>
            {authors.length > 0 && (
              <p className="mt-1 text-lg text-muted-foreground">
                {authors.join(", ")}
              </p>
            )}
          </div>

          {work.series && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {work.series.name}
                {work.seriesPosition != null && ` #${String(work.seriesPosition)}`}
              </Badge>
            </div>
          )}

          {work.description && (
            <p className="text-sm text-muted-foreground">{work.description}</p>
          )}

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <MetadataField label="Language" value={work.language} />
            <MetadataField label="Publisher" value={work.editions[0]?.publisher} />
            <MetadataField label="Published" value={work.editions[0]?.publishedAt ? new Date(work.editions[0].publishedAt).toLocaleDateString() : null} />
            <MetadataField label="ISBN-13" value={work.editions[0]?.isbn13} />
            <MetadataField label="ISBN-10" value={work.editions[0]?.isbn10} />
            <MetadataField label="ASIN" value={work.editions[0]?.asin} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Editions</h2>
        {work.editions.map((edition) => (
          <Card key={edition.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Badge variant="secondary">{edition.formatFamily}</Badge>
                {edition.publisher && (
                  <span className="text-sm text-muted-foreground">{edition.publisher}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {edition.contributors.length > 0 && (
                <div className="text-sm">
                  {edition.contributors.map((c) => (
                    <span key={`${c.role}-${c.contributor.nameDisplay}`} className="mr-3">
                      <span className="text-muted-foreground">{c.role}: </span>
                      {c.contributor.nameDisplay}
                    </span>
                  ))}
                </div>
              )}
              {edition.editionFiles.length > 0 && (
                <div className="space-y-1 text-sm">
                  {edition.editionFiles.map((ef) => (
                    <div key={ef.id} className="flex items-center gap-2">
                      <span className="font-mono text-xs">{ef.fileAsset.basename}</span>
                      <span className="text-muted-foreground">
                        {ef.fileAsset.sizeBytes != null ? formatBytes(ef.fileAsset.sizeBytes) : "—"}
                      </span>
                      <Badge variant={ef.fileAsset.availabilityStatus === "PRESENT" ? "outline" : "destructive"} className="text-[10px]">
                        {ef.fileAsset.availabilityStatus}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MetadataField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p>{value}</p>
    </div>
  );
}
