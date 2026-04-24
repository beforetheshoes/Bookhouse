import { useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Camera, ChevronRight, ImagePlus, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { WorkCard } from "~/components/work-card";
import { AuthorAvatar } from "~/components/author-avatar";
import { GridPageSkeleton } from "~/components/skeletons/grid-page-skeleton";
import { getAuthorDetailServerFn, fetchAuthorPhotoFromUrlServerFn } from "~/lib/server-fns/authors";
import { updateContributorServerFn } from "~/lib/server-fns/editing";
import { EditableField } from "~/components/editable-field";
import { runMutation } from "~/lib/mutation";

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
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/upload-author-photo/${author.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }
      toast.success("Author photo updated");
      setPhotoVersion((v) => v + 1);
      void router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handlePhotoUrl() {
    setUploading(true);
    try {
      await runMutation(
        () => fetchAuthorPhotoFromUrlServerFn({ data: { contributorId: author.id, imageUrl: photoUrl.trim() } }),
        { success: "Author photo updated" },
      );
      setPhotoVersion((v) => v + 1);
      setShowUrlInput(false);
      setPhotoUrl("");
      void router.invalidate();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/authors" className="hover:text-foreground">
          Authors
        </Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{author.nameDisplay}</span>
      </nav>

      <div className="flex items-center gap-4">
        <div
          className="group relative cursor-pointer"
          data-testid="avatar-upload-button"
          onClick={() => { photoInputRef.current?.click(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") photoInputRef.current?.click(); }}
        >
          <AuthorAvatar
            id={author.id}
            imagePath={author.imagePath}
            size="medium"
            className="size-16"
            cacheVersion={photoVersion}
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-5 text-white" />
          </div>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="photo-file-input"
          onChange={(e) => { void handlePhotoUpload(e); }}
          disabled={uploading}
        />
        <div>
          <h1 className="text-2xl font-bold">{author.nameDisplay}</h1>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <span className="mr-1">Sort as:</span>
            <EditableField
              value={author.nameSort ?? ""}
              onSave={async (val) => {
                await updateContributorServerFn({ data: { contributorId: author.id, nameSort: val } });
                void router.invalidate();
              }}
              placeholder="auto"
              className="text-xs"
              required
            />
          </div>
          <button
            type="button"
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setShowUrlInput((v) => !v); }}
            data-testid="link-photo-button"
          >
            <Link2 className="size-3" />
            Link to photo
          </button>
        </div>
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2" data-testid="url-input-row">
          <Input
            placeholder="https://example.com/author-photo.jpg"
            value={photoUrl}
            onChange={(e) => { setPhotoUrl(e.target.value); }}
            className="max-w-md"
            data-testid="photo-url-input"
          />
          <Button size="sm" disabled={uploading || !photoUrl.trim()} onClick={() => { void handlePhotoUrl(); }}>
            <ImagePlus className="size-4" />
            Fetch
          </Button>
        </div>
      )}

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
