import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ProgressBar } from "~/components/progress-bar";
import { EnrichmentReview } from "~/components/enrichment-review";
import {
  getWorkDetailServerFn,
  type WorkDetail,
} from "~/lib/server-fns/work-detail";
import { getReadingProgressServerFn } from "~/lib/server-fns/reading-progress";
import { deleteWorkServerFn, deleteEditionServerFn } from "~/lib/server-fns/deletion";
import { EditableField } from "~/components/editable-field";
import { updateWorkServerFn, updateEditionServerFn, updateWorkAuthorsServerFn } from "~/lib/server-fns/editing";

export const Route = createFileRoute("/_authenticated/library/$workId")({
  loader: async ({ params }) => {
    const [work, { progress, trackingMode }] = await Promise.all([
      getWorkDetailServerFn({ data: { workId: params.workId } }),
      getReadingProgressServerFn({ data: { workId: params.workId } }),
    ]);
    return { work, progress, trackingMode };
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

function getAuthors(work: WorkDetail): { id: string; name: string }[] {
  const seen = new Set<string>();
  const authors: { id: string; name: string }[] = [];
  for (const edition of work.editions) {
    for (const c of edition.contributors) {
      if (c.role === "AUTHOR" && !seen.has(c.contributor.id)) {
        seen.add(c.contributor.id);
        authors.push({ id: c.contributor.id, name: c.contributor.nameDisplay });
      }
    }
  }
  return authors;
}

function formatBytes(bytes: bigint | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${String(n)} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function WorkDetailPage() {
  const { work, progress, trackingMode } = Route.useLoaderData();
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const [deleteWorkOpen, setDeleteWorkOpen] = useState(false);
  const [deletingWork, setDeletingWork] = useState(false);
  const [deleteEditionOpen, setDeleteEditionOpen] = useState<string | null>(null);
  const [deletingEdition, setDeletingEdition] = useState(false);
  const showPlaceholder = !work.coverPath || imgFailed;
  const authors = getAuthors(work);

  async function handleDeleteWork() {
    setDeletingWork(true);
    try {
      await deleteWorkServerFn({ data: { workId: work.id } });
      toast.success(`"${work.titleDisplay}" deleted`);
      setDeleteWorkOpen(false);
      void router.navigate({ to: "/library", search: { page: 1, pageSize: 50, sort: "title-asc" as const } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete work");
    } finally {
      setDeletingWork(false);
    }
  }

  async function handleDeleteEdition(editionId: string) {
    setDeletingEdition(true);
    try {
      const result = await deleteEditionServerFn({ data: { editionId } });
      if (result.deletedWorkId) {
        toast.success("Edition deleted — work had no remaining editions and was also removed");
        void router.navigate({ to: "/library", search: { page: 1, pageSize: 50, sort: "title-asc" as const } });
      } else {
        toast.success("Edition deleted");
        void router.invalidate();
      }
      setDeleteEditionOpen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete edition");
    } finally {
      setDeletingEdition(false);
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/library" search={{ page: 1, pageSize: 50, sort: "title-asc" as const }} className="hover:text-foreground">
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
            <div className="flex items-start gap-3">
              <h1 className="flex-1 text-2xl font-bold">
                <EditableField
                  value={work.titleDisplay}
                  onSave={async (val) => {
                    await updateWorkServerFn({ data: { workId: work.id, fields: { titleDisplay: val } } });
                    void router.invalidate();
                  }}
                  required
                  className="text-2xl font-bold"
                />
              </h1>
              <Button data-testid="delete-work-btn" variant="outline" size="sm" onClick={() => { setDeleteWorkOpen(true); }}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-1 text-lg text-muted-foreground">
              <EditableField
                value={authors.map((a) => a.name).join(", ")}
                required
                onSave={async (val) => {
                  const authorList = val.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
                  await updateWorkAuthorsServerFn({ data: { workId: work.id, authors: authorList } });
                  void router.invalidate();
                }}
                placeholder="No authors"
              />
            </div>
          </div>

          {work.series && (
            <div className="flex items-center gap-2">
              <Link to="/series/$seriesId" params={{ seriesId: work.series.id }}>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  {work.series.name}
                  {work.seriesPosition != null && ` #${String(work.seriesPosition)}`}
                </Badge>
              </Link>
            </div>
          )}

          <div className="space-y-0.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</div>
            <div className="text-sm leading-relaxed">
              <EditableField
                value={work.description ?? ""}
                onSave={async (val) => {
                  await updateWorkServerFn({ data: { workId: work.id, fields: { description: val || null } } });
                  void router.invalidate();
                }}
                renderAs="textarea"
                placeholder="No description"
              />
            </div>
          </div>

          {work.editions[0] && (
            <EditableMetadataGrid edition={work.editions[0]} router={router} />
          )}
        </div>
      </div>

      <EnrichmentReview workId={work.id} currentDescription={work.description ?? null} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Editions</h2>
        {work.editions.map((edition) => (
          <Card key={edition.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="secondary">{edition.formatFamily}</Badge>
                  {edition.publisher && (
                    <span className="text-sm text-muted-foreground">{edition.publisher}</span>
                  )}
                </CardTitle>
                <Button data-testid={`delete-edition-${edition.id}`} variant="outline" size="sm" onClick={() => { setDeleteEditionOpen(edition.id); }}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
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

      <LinkedFormats editions={work.editions} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Reading Progress</h2>
        {progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reading progress yet</p>
        ) : trackingMode === "BY_WORK" ? (
          <WorkProgress progress={progress} />
        ) : (
          <EditionProgress progress={progress} editions={work.editions} />
        )}
      </div>

      <Dialog open={deleteWorkOpen} onOpenChange={setDeleteWorkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Work</DialogTitle>
            <DialogDescription>
              This will remove &ldquo;{work.titleDisplay}&rdquo; and all its editions from the library.
              The actual files on disk will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteWorkOpen(false); }} disabled={deletingWork}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => { void handleDeleteWork(); }} disabled={deletingWork}>
              {deletingWork ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteEditionOpen !== null} onOpenChange={(open) => { if (!open) setDeleteEditionOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Edition</DialogTitle>
            <DialogDescription>
              This will remove this edition from the library.
              {work.editions.length === 1 && " Since it is the last edition, the work will also be removed."}
              {" "}The actual files on disk will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteEditionOpen(null); }} disabled={deletingEdition}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => { if (deleteEditionOpen) void handleDeleteEdition(deleteEditionOpen); }} disabled={deletingEdition}>
              {deletingEdition ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function LinkedFormats({ editions }: { editions: WorkDetail["editions"] }) {
  const formats = new Set(editions.map((e) => e.formatFamily));
  if (formats.size <= 1) return null;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Linked Formats</h2>
      <div className="flex gap-2">
        {[...formats].map((format) => (
          <Badge key={format} variant="secondary">{format}</Badge>
        ))}
      </div>
    </div>
  );
}

function WorkProgress({ progress }: { progress: { percent: number | null }[] }) {
  const maxPercent = Math.max(...progress.map((p) => p.percent ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ProgressBar percent={maxPercent} />
        </div>
        <span className="text-sm text-muted-foreground">{String(maxPercent)}%</span>
      </div>
    </div>
  );
}

function EditionProgress({
  progress,
  editions,
}: {
  progress: { editionId: string; progressKind: string; percent: number | null }[];
  editions: WorkDetail["editions"];
}) {
  const editionMap = new Map(editions.map((e) => [e.id, e]));
  return (
    <div className="space-y-3">
      {progress.map((p) => {
        const edition = editionMap.get(p.editionId);
        return (
          <div key={`${p.editionId}-${p.progressKind}`} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              {edition && <Badge variant="secondary">{edition.formatFamily}</Badge>}
              <span className="text-muted-foreground">{p.progressKind}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ProgressBar percent={p.percent} />
              </div>
              <span className="text-sm text-muted-foreground">{String(p.percent ?? 0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditableMetadataGrid({ edition, router }: { edition: WorkDetail["editions"][number]; router: { invalidate: () => void } }) {
  async function saveEditionField(field: string, val: string) {
    await updateEditionServerFn({ data: { editionId: edition.id, fields: { [field]: val || null } } });
    router.invalidate();
  }

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
      <MetadataItem label="Language">
        <EditableField value={edition.language ?? ""} onSave={(val) => saveEditionField("language", val)} placeholder="—" />
      </MetadataItem>
      <MetadataItem label="Publisher">
        <EditableField value={edition.publisher ?? ""} onSave={(val) => saveEditionField("publisher", val)} placeholder="—" />
      </MetadataItem>
      <MetadataItem label="Published">
        <EditableField value={edition.publishedAt ? new Date(edition.publishedAt).toLocaleDateString() : ""} onSave={(val) => saveEditionField("publishedAt", val)} placeholder="—" />
      </MetadataItem>
      <MetadataItem label="ISBN-13">
        <EditableField value={edition.isbn13 ?? ""} onSave={(val) => saveEditionField("isbn13", val)} placeholder="—" />
      </MetadataItem>
      <MetadataItem label="ISBN-10">
        <EditableField value={edition.isbn10 ?? ""} onSave={(val) => saveEditionField("isbn10", val)} placeholder="—" />
      </MetadataItem>
      <MetadataItem label="ASIN">
        <EditableField value={edition.asin ?? ""} onSave={(val) => saveEditionField("asin", val)} placeholder="—" />
      </MetadataItem>
    </div>
  );
}

function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
