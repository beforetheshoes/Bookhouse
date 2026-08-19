import { useEffect, useRef, useState, type DragEvent, type SyntheticEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import {
  getLibraryRootsServerFn,
  type LibraryRootRow,
} from "~/lib/server-fns/library-roots";
import { getUploadStatusServerFn, type UploadStatusResult } from "~/lib/server-fns/upload-status";
import { subscribePendingUploadFiles, takePendingUploadFiles } from "~/lib/pending-upload";
import { z } from "zod";

const uploadBookResponseSchema = z.object({ importJobId: z.string() });

export interface UploadLoaderData {
  libraryRoots: LibraryRootRow[];
}

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { roles?: string[] } };
    if (!ctx.user?.roles?.includes("OWNER")) {
      throw redirect({ to: "/library", search: { page: 1, pageSize: 50, sort: "title-asc" as const, view: "works" as const } });
    }
  },
  loader: async () => {
    const libraryRoots = await getLibraryRootsServerFn();
    return { libraryRoots } satisfies UploadLoaderData;
  },
  component: UploadPage,
});

type ServerJobStatus = Exclude<UploadStatusResult, null>["status"];

interface UploadJobState {
  importJobId: string;
  status: ServerJobStatus | "uploading";
  totalFiles: number;
  processedFiles: number;
  errorCount: number;
  error?: string | null;
}

export function UploadPage() {
  const { libraryRoots } = Route.useLoaderData();
  return <UploadForm libraryRoots={libraryRoots} />;
}

export interface UploadFormProps {
  libraryRoots: LibraryRootRow[];
}

export function UploadForm({ libraryRoots }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [libraryRootId, setLibraryRootId] = useState<string>(libraryRoots[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [seriesIndex, setSeriesIndex] = useState("");
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<UploadJobState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Take files dropped anywhere in the app (stashed by GlobalUploadDrop
  // before navigating here), then subscribe for drops that happen while
  // this form is already mounted.
  useEffect(() => {
    const pending = takePendingUploadFiles();
    if (pending.length > 0) {
      setFiles((prev) => [...prev, ...pending]);
    }
    return subscribePendingUploadFiles((dropped) => {
      setFiles((prev) => [...prev, ...dropped]);
    });
  }, []);

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    // Keep local drops out of the window-level drop target.
    e.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      setFiles((prev) => [...prev, ...dropped]);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(): void {
    setIsDragging(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length > 0) {
      setFiles((prev) => [...prev, ...picked]);
    }
    e.target.value = "";
  }

  function removeFile(index: number): void {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm(): void {
    setFiles([]);
    setTitle("");
    setAuthor("");
    setSeries("");
    setSeriesIndex("");
    setDescription("");
  }

  async function handleSubmit(e: SyntheticEvent): Promise<void> {
    e.preventDefault();
    // libraryRootId is guaranteed non-empty when reaching here because the
    // submit button is disabled when libraryRoots is empty (no Select renders),
    // and the Select widget never allows an empty value.
    if (files.length === 0) {
      toast.error("Add at least one file");
      return;
    }

    setSubmitting(true);
    setActiveJob({
      importJobId: "",
      status: "uploading",
      totalFiles: files.length,
      processedFiles: 0,
      errorCount: 0,
    });

    try {
      const formData = new FormData();
      formData.append("libraryRootId", libraryRootId);
      if (title.trim()) formData.append("title", title.trim());
      if (author.trim()) formData.append("author", author.trim());
      if (series.trim()) formData.append("series", series.trim());
      if (seriesIndex.trim()) formData.append("seriesIndex", seriesIndex.trim());
      if (description.trim()) formData.append("description", description.trim());
      for (const file of files) {
        formData.append("file", file, file.name);
      }

      const res = await fetch("/api/upload-book", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed: ${String(res.status)}`);
      }
      const body = uploadBookResponseSchema.parse(await res.json());

      setActiveJob({
        importJobId: body.importJobId,
        status: "QUEUED",
        totalFiles: files.length,
        processedFiles: 0,
        errorCount: 0,
      });
      toast.success("Upload complete — processing in the background");
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      setActiveJob(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload a book</h1>
        <p className="text-sm text-muted-foreground">
          Add a single ebook (.epub / .pdf), a single audiobook (.m4b), or a set of audio chapters.
          Optionally include a metadata.opf / metadata.json sidecar and a cover image.
        </p>
      </div>

      <form className="space-y-6" onSubmit={(e) => { void handleSubmit(e); }}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="library-root">Library</label>
          {libraryRoots.length === 0 ? (
            <p className="text-sm text-destructive">
              No library roots configured. Add one in Settings before uploading.
            </p>
          ) : (
            <Select value={libraryRootId} onValueChange={setLibraryRootId}>
              <SelectTrigger id="library-root" className="w-full">
                <SelectValue placeholder="Choose a library" />
              </SelectTrigger>
              <SelectContent>
                {libraryRoots.map((root) => (
                  <SelectItem key={root.id} value={root.id}>
                    {root.name} ({root.kind})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Files</label>
          <div
            data-testid="upload-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
          >
            <UploadIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop files here, or
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              data-testid="upload-file-input"
              onChange={handleFileInput}
            />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1 rounded border p-2 text-sm">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${String(i)}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => { removeFile(i); }}
                    aria-label={`Remove ${file.name}`}
                    className="flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground md:size-auto"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="upload-title">Title</label>
          <Input
            id="upload-title"
            value={title}
            placeholder="Auto-detected from file metadata"
            onChange={(e) => { setTitle(e.target.value); }}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="upload-author">Author</label>
          <Input
            id="upload-author"
            value={author}
            placeholder="Auto-detected from file metadata"
            onChange={(e) => { setAuthor(e.target.value); }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="upload-series">Series (optional)</label>
            <Input
              id="upload-series"
              value={series}
              onChange={(e) => { setSeries(e.target.value); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="upload-series-index">Series index (optional)</label>
            <Input
              id="upload-series-index"
              value={seriesIndex}
              onChange={(e) => { setSeriesIndex(e.target.value); }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="upload-description">Description (optional)</label>
          <Textarea
            id="upload-description"
            value={description}
            onChange={(e) => { setDescription(e.target.value); }}
            rows={3}
          />
        </div>

        <Button type="submit" disabled={submitting || libraryRoots.length === 0}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Uploading…
            </>
          ) : (
            "Upload"
          )}
        </Button>
      </form>

      {activeJob && <UploadStatusPanel job={activeJob} />}
    </div>
  );
}

interface UploadStatusPanelProps {
  job: UploadJobState;
}

export function UploadStatusPanel({ job }: UploadStatusPanelProps) {
  const [latest, setLatest] = useState<UploadJobState>(job);

  useEffect(() => {
    setLatest(job);
  }, [job]);

  useEffect(() => {
    if (!job.importJobId) return;
    if (latest.status === "SUCCEEDED" || latest.status === "FAILED") return;
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const status = await getUploadStatusServerFn({
          data: { importJobId: job.importJobId },
        });
        if (cancelled || status === null) return;
        setLatest((prev) => ({
          ...prev,
          status: status.status,
          totalFiles: status.totalFiles,
          processedFiles: status.processedFiles,
          errorCount: status.errorCount,
          error: "error" in status ? status.error : undefined,
        }));
      } catch {
        // Network blip; keep polling.
      }
    }

    const interval = setInterval(() => { void poll(); }, 2000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [job.importJobId, latest.status]);

  return (
    <div
      data-testid="upload-status"
      className="rounded-lg border bg-muted/30 p-4"
    >
      <p className="font-medium">
        {latest.status === "uploading" && "Uploading files…"}
        {latest.status === "QUEUED" && "Queued for processing…"}
        {latest.status === "RUNNING" && "Processing…"}
        {latest.status === "SUCCEEDED" && "Upload complete"}
        {latest.status === "FAILED" && "Upload failed"}
      </p>
      {(latest.status === "RUNNING" || latest.status === "QUEUED") && (
        <p className="text-sm text-muted-foreground">
          {String(latest.processedFiles)} / {String(latest.totalFiles)} files processed
          {latest.errorCount > 0 ? ` (${String(latest.errorCount)} errors)` : ""}
        </p>
      )}
      {latest.status === "FAILED" && latest.error && (
        <p className="text-sm text-destructive">{latest.error}</p>
      )}
    </div>
  );
}
