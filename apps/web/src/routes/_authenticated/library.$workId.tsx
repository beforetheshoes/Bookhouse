import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Headphones, Sparkles, Trash2 } from "lucide-react";
import { WorkCover } from "~/components/work-cover";
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
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { EnrichmentDialog } from "~/components/enrichment-dialog";
import { WorkProgress } from "~/components/work-progress";
import { EditionProgress } from "~/components/edition-progress";
import { ShelfMembership } from "~/components/shelf-membership";
import { CoverSearchDialog } from "~/components/cover-search-dialog";
import { EditionCard } from "~/components/edition-card";
import { MetadataItem } from "~/components/metadata-item";
import { getShelvesForWorkServerFn } from "~/lib/server-fns/shelves";
import {
  getWorkDetailServerFn,
  type WorkDetail,
} from "~/lib/server-fns/work-detail";
import { getReadingProgressServerFn, updateReadingProgressServerFn } from "~/lib/server-fns/reading-progress";
import { deleteWorkServerFn, deleteEditionServerFn } from "~/lib/server-fns/deletion";
import { EditableField } from "~/components/editable-field";
import { EditableTagField } from "~/components/editable-tag-field";
import { updateWorkServerFn, updateWorkAuthorsServerFn, getContributorNamesServerFn } from "~/lib/server-fns/editing";
import { getSmtpStatusServerFn } from "~/lib/server-fns/smtp";
import { getKindleStatusServerFn } from "~/lib/server-fns/kindle";
import { updateWorkTagsServerFn } from "~/lib/server-fns/tags";
import { useAppColor } from "~/hooks/use-app-color";

export const Route = createFileRoute("/_authenticated/library/$workId")({
  loader: async ({ params }) => {
    const [work, { progress, trackingMode }, contributorNames, smtpStatus, kindleStatus, shelves] = await Promise.all([
      getWorkDetailServerFn({ data: { workId: params.workId } }),
      getReadingProgressServerFn({ data: { workId: params.workId } }),
      getContributorNamesServerFn(),
      getSmtpStatusServerFn(),
      getKindleStatusServerFn(),
      getShelvesForWorkServerFn({ data: { workId: params.workId } }),
    ]);
    return { work, progress, trackingMode, contributorNames, smtpConfigured: smtpStatus.configured, kindleConfigured: kindleStatus.configured, shelves };
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

export function editionSortKey(e: WorkDetail["editions"][number]): string {
  const pub = (e.publisher ?? "").toLowerCase();
  const file = e.editionFiles[0]?.fileAsset.basename ?? "";
  return `${pub}\0${file}`;
}

function sortEditions(editions: WorkDetail["editions"]): WorkDetail["editions"] {
  return [...editions].sort((a, b) => editionSortKey(a).localeCompare(editionSortKey(b)));
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


function WorkDetailPage() {
  const { work, progress, trackingMode, contributorNames, smtpConfigured, kindleConfigured, shelves } = Route.useLoaderData();
  const router = useRouter();
  const [deleteWorkOpen, setDeleteWorkOpen] = useState(false);
  const [deletingWork, setDeletingWork] = useState(false);
  const [deleteEditionOpen, setDeleteEditionOpen] = useState<string | null>(null);
  const [deletingEdition, setDeletingEdition] = useState(false);
  const [coverVersion, setCoverVersion] = useState(0);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichMode, setEnrichMode] = useState<"work" | "edition">("work");
  const [enrichEditionId, setEnrichEditionId] = useState<string | null>(null);
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);
  const formatFamilies = [...new Set(work.editions.map((e) => e.formatFamily))];
  const [activeFormat, setActiveFormat] = useState(formatFamilies[0] ?? "EBOOK");
  const authors = getAuthors(work);
  const coverColors = work.coverColors as string[] | null;
  const { setBookColors } = useAppColor();

  // Push this work's cover colors to the global color provider
  useEffect(() => {
    setBookColors(coverColors);
  }, [coverColors, setBookColors]);

  const maxPercent = progress.length > 0
    ? Math.max(...progress.map((p) => p.percent ?? 0))
    : null;

  async function handleUpdateProgress(editionId: string, percent: number, progressKind: string) {
    await updateReadingProgressServerFn({ data: { editionId, percent, progressKind: progressKind as "EBOOK" | "AUDIO" | "READALOUD" } });
    void router.invalidate();
  }

  const firstPublishYear = (() => {
    let earliest: Date | null = null;
    for (const edition of work.editions) {
      if (edition.publishedAt) {
        const d = new Date(edition.publishedAt);
        if (!earliest || d < earliest) earliest = d;
      }
    }
    return earliest ? earliest.getFullYear() : null;
  })();

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

  const enrichEdition = enrichMode === "edition"
    ? work.editions.find((e) => e.id === enrichEditionId)
    : work.editions[0];
  const enrichEditionNarrators = enrichEdition
    ? enrichEdition.contributors.filter((c) => c.role === "NARRATOR").map((c) => c.contributor.nameDisplay)
    : [];

  const handleCoverUpdated = () => {
    setCoverVersion((v) => v + 1);
    void router.invalidate();
  };

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
        <WorkCover
          workId={work.id}
          coverPath={work.coverPath}
          titleDisplay={work.titleDisplay}
          maxPercent={maxPercent}
          coverVersion={coverVersion}
          onCoverUpdated={handleCoverUpdated}
          onCoverSearchOpen={() => { setCoverSearchOpen(true); }}
        />

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
              <Button variant="outline" size="sm" onClick={() => { setEnrichMode("work"); setEnrichOpen(true); }}>
                <Sparkles className="size-4" />
                Enrich Work
              </Button>
              <Button data-testid="delete-work-btn" variant="outline" size="sm" onClick={() => { setDeleteWorkOpen(true); }}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-1 text-lg text-muted-foreground">
              <EditableTagField
                values={authors.map((a) => a.name)}
                suggestions={contributorNames}
                required
                onSave={async (authorList) => {
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

          {firstPublishYear && (
            <p className="text-sm text-muted-foreground">First published {firstPublishYear}</p>
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

          <MetadataItem label="Tags">
            <EditableField
              value={work.tags.map((wt) => wt.tag.name).join(", ")}
              onSave={async (val) => {
                const tagList = val.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
                await updateWorkTagsServerFn({ data: { workId: work.id, tags: tagList } });
                void router.invalidate();
              }}
              placeholder="No tags"
            />
          </MetadataItem>

          <MetadataItem label="Shelves">
            <ShelfMembership workId={work.id} shelves={shelves} onToggled={() => { void router.invalidate(); }} />
          </MetadataItem>
        </div>
      </div>

      <EnrichmentDialog
        open={enrichOpen}
        onOpenChange={setEnrichOpen}
        workId={work.id}
        editionId={enrichEdition?.id ?? null}
        mode={enrichMode}
        currentWork={{
          title: work.titleDisplay,
          authors: authors.map((a) => a.name),
          description: work.description ?? null,
          coverPath: work.coverPath ?? null,
          tags: work.tags.map((wt) => wt.tag.name),
          editedFields: work.editedFields,
        }}
        currentEdition={enrichEdition ? {
          publisher: enrichEdition.publisher ?? null,
          publishedDate: enrichEdition.publishedAt ? String(enrichEdition.publishedAt) : null,
          isbn13: enrichEdition.isbn13 ?? null,
          isbn10: enrichEdition.isbn10 ?? null,
          language: enrichEdition.language ?? null,
          pageCount: enrichEdition.pageCount ?? null,
          asin: enrichEdition.asin ?? null,
          duration: enrichEdition.duration ?? null,
          narrators: enrichEditionNarrators,
          editedFields: enrichEdition.editedFields,
        } : null}
        onApplied={handleCoverUpdated}
      />

      <CoverSearchDialog
        open={coverSearchOpen}
        onOpenChange={setCoverSearchOpen}
        workId={work.id}
        workTitle={work.titleDisplay}
        onApplied={handleCoverUpdated}
      />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Reading Progress</h2>
        {trackingMode === "BY_WORK" ? (
          progress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reading progress yet</p>
          ) : (
            <WorkProgress progress={progress} />
          )
        ) : (
          <EditionProgress progress={progress} editions={work.editions} onUpdate={handleUpdateProgress} />
        )}
      </div>

      {work.editions.length > 0 && (
        <Tabs value={activeFormat} onValueChange={setActiveFormat}>
          <div className="flex justify-center">
            <TabsList>
              {formatFamilies.map((fmt) => (
                <TabsTrigger key={fmt} value={fmt}>
                  {fmt === "AUDIOBOOK" ? <Headphones className="size-4" /> : <BookOpen className="size-4" />}
                  {fmt}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {formatFamilies.map((fmt) => (
            <TabsContent key={fmt} value={fmt} className="space-y-4 pt-2">
              {sortEditions(work.editions.filter((e) => e.formatFamily === fmt)).map((edition) => (
                <EditionCard
                  key={edition.id}
                  edition={edition}
                  onEditionFieldSaved={() => { void router.invalidate(); }}
                  onDeleteEdition={() => { setDeleteEditionOpen(edition.id); }}
                  onEnrichEdition={() => { setEnrichEditionId(edition.id); setEnrichMode("edition"); setEnrichOpen(true); }}
                  smtpConfigured={smtpConfigured}
                  kindleConfigured={kindleConfigured}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}

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


