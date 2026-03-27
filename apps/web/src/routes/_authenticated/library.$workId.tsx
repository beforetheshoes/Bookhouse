import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, ChevronRight, ImagePlus, Loader2, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { ProgressBar } from "~/components/progress-bar";
import { EnrichmentDialog } from "~/components/enrichment-dialog";
import { CoverSearchDialog } from "~/components/cover-search-dialog";
import { EditionTabPanel } from "~/components/edition-tab-panel";
import { MetadataItem } from "~/components/metadata-item";
import {
  getWorkDetailServerFn,
  type WorkDetail,
} from "~/lib/server-fns/work-detail";
import { getReadingProgressServerFn } from "~/lib/server-fns/reading-progress";
import { deleteWorkServerFn, deleteEditionServerFn } from "~/lib/server-fns/deletion";
import { EditableField } from "~/components/editable-field";
import { updateWorkServerFn, updateWorkAuthorsServerFn } from "~/lib/server-fns/editing";
import { updateWorkTagsServerFn } from "~/lib/server-fns/tags";
import { useAppColor } from "~/hooks/use-app-color";

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


function WorkDetailPage() {
  const { work, progress, trackingMode } = Route.useLoaderData();
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const [deleteWorkOpen, setDeleteWorkOpen] = useState(false);
  const [deletingWork, setDeletingWork] = useState(false);
  const [deleteEditionOpen, setDeleteEditionOpen] = useState<string | null>(null);
  const [deletingEdition, setDeletingEdition] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverVersion, setCoverVersion] = useState(0);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);
  const [activeEditionIdx, setActiveEditionIdx] = useState(0);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const showPlaceholder = !work.coverPath || imgFailed;
  const authors = getAuthors(work);
  const coverColors = work.coverColors as string[] | null;
  const { setBookColors } = useAppColor();

  // Push this work's cover colors to the global color provider
  useEffect(() => {
    setBookColors(coverColors);
  }, [coverColors, setBookColors]);

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

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/upload-cover/${work.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }
      toast.success("Cover updated");
      setImgFailed(false);
      setCoverVersion((v) => v + 1);
      void router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload cover");
    } finally {
      setUploadingCover(false);
      e.target.value = "";
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className="group relative aspect-[2/3] cursor-pointer overflow-hidden rounded-lg bg-muted"
                role="button"
                tabIndex={0}
              >
                {showPlaceholder ? (
                  <div data-testid="cover-placeholder" className="flex size-full items-center justify-center text-muted-foreground">
                    <BookOpen className="size-12" />
                  </div>
                ) : (
                  <img
                    src={`/api/covers/${work.id}/medium?v=${String(coverVersion)}`}
                    alt={work.titleDisplay}
                    onError={() => { setImgFailed(true); }}
                    className="size-full object-cover"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingCover ? (
                    <Loader2 className="size-8 animate-spin text-white" />
                  ) : (
                    <ImagePlus className="size-8 text-white" />
                  )}
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem data-testid="cover-upload-option" onClick={() => { coverInputRef.current?.click(); }}>
                <Upload className="size-4 mr-2" />
                Upload from file
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="cover-search-option" onClick={() => { setCoverSearchOpen(true); }}>
                <Search className="size-4 mr-2" />
                Search for cover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="cover-file-input"
            onChange={(e) => { void handleCoverUpload(e); }}
          />
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
              <Button variant="outline" size="sm" onClick={() => { setEnrichOpen(true); }}>
                <Sparkles className="size-4" />
                Enrich
              </Button>
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
        </div>
      </div>

      <EnrichmentDialog
        open={enrichOpen}
        onOpenChange={setEnrichOpen}
        workId={work.id}
        editionId={work.editions[activeEditionIdx]?.id ?? null}
        currentWork={{
          title: work.titleDisplay,
          authors: authors.map((a) => a.name),
          description: work.description ?? null,
          coverPath: work.coverPath ?? null,
          tags: work.tags.map((wt) => wt.tag.name),
          editedFields: work.editedFields,
        }}
        currentEdition={work.editions[activeEditionIdx] ? {
          publisher: work.editions[activeEditionIdx].publisher ?? null,
          publishedDate: work.editions[activeEditionIdx].publishedAt ? String(work.editions[activeEditionIdx].publishedAt) : null,
          isbn13: work.editions[activeEditionIdx].isbn13 ?? null,
          isbn10: work.editions[activeEditionIdx].isbn10 ?? null,
          language: work.editions[activeEditionIdx].language ?? null,
          pageCount: work.editions[activeEditionIdx].pageCount ?? null,
          editedFields: work.editions[activeEditionIdx].editedFields,
        } : null}
        onApplied={() => { setCoverVersion((v) => v + 1); void router.invalidate(); }}
      />

      <CoverSearchDialog
        open={coverSearchOpen}
        onOpenChange={setCoverSearchOpen}
        workId={work.id}
        workTitle={work.titleDisplay}
        onApplied={() => { setCoverVersion((v) => v + 1); void router.invalidate(); }}
      />

      {work.editions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Editions</h2>
          <Tabs
            value={work.editions[activeEditionIdx]?.id ?? ""}
            onValueChange={(id) => {
              const idx = work.editions.findIndex((e) => e.id === id);
              if (idx >= 0) setActiveEditionIdx(idx);
            }}
          >
            <TabsList>
              {work.editions.map((edition) => (
                <TabsTrigger key={edition.id} value={edition.id}>
                  {edition.formatFamily}
                </TabsTrigger>
              ))}
            </TabsList>
            {work.editions.map((edition) => (
              <TabsContent key={edition.id} value={edition.id}>
                <EditionTabPanel
                  edition={edition}
                  isLastEdition={work.editions.length === 1}
                  onEditionFieldSaved={() => { void router.invalidate(); }}
                  onDeleteEdition={() => { setDeleteEditionOpen(edition.id); }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

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

