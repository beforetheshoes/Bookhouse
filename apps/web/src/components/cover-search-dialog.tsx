import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, SearchX } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { searchEnrichmentServerFn, applyCoverFromUrlServerFn } from "~/lib/server-fns/enrichment";
import type { SourceResult, EnrichmentProvider } from "@bookhouse/ingest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoverSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  workTitle: string;
  onApplied: () => void;
}

interface CoverOption {
  provider: EnrichmentProvider;
  externalId: string;
  coverUrl: string;
}

const PROVIDER_LABELS: Record<EnrichmentProvider, string> = {
  openlibrary: "Open Library",
  googlebooks: "Google Books",
  hardcover: "Hardcover",
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CoverSearchDialog({
  open,
  onOpenChange,
  workId,
  workTitle,
  onApplied,
}: CoverSearchDialogProps) {
  const [status, setStatus] = useState<"loading" | "error" | "no-results" | "success" | null>(null);
  const [covers, setCovers] = useState<CoverOption[]>([]);
  const [selected, setSelected] = useState<CoverOption | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [applying, setApplying] = useState(false);

  // Auto-search when dialog opens
  useEffect(() => {
    if (!open) return;
    const ctrl = { cancelled: false };

    setStatus("loading");
    setCovers([]);
    setSelected(null);
    setCustomUrl("");

    void (async () => {
      try {
        const response = await searchEnrichmentServerFn({ data: { workId } }) as {
          status: string;
          results?: SourceResult[];
        };

        if (ctrl.cancelled) return;

        if (response.status === "success" && response.results) {
          const coverOptions: CoverOption[] = response.results
            .filter((r): r is SourceResult & { work: { coverUrl: string } } => r.work.coverUrl !== null)
            .map((r) => ({
              provider: r.provider,
              externalId: r.externalId,
              coverUrl: r.work.coverUrl,
            }));

          if (coverOptions.length > 0) {
            setCovers(coverOptions);
            setStatus("success");
          } else {
            setStatus("no-results");
          }
        } else {
          setStatus("no-results");
        }
      } catch {
        if (ctrl.cancelled) return;
        setStatus("error");
      }
    })();

    return () => { ctrl.cancelled = true; };
  }, [open, workId]);

  const canApply = selected !== null || customUrl.trim().length > 0;

  const handleApply = async () => {
    setApplying(true);
    try {
      if (selected) {
        await applyCoverFromUrlServerFn({
          data: {
            workId,
            imageUrl: selected.coverUrl,
            source: { provider: selected.provider, externalId: selected.externalId },
          },
        });
      } else {
        await applyCoverFromUrlServerFn({
          data: {
            workId,
            imageUrl: customUrl.trim(),
          },
        });
      }

      toast.success("Cover image updated");
      onOpenChange(false);
      onApplied();
    } catch {
      toast.error("Failed to apply cover image");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Find Cover Image</DialogTitle>
          <DialogDescription>
            Search for cover images of &ldquo;{workTitle}&rdquo; or paste an image URL.
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {status === "loading" && (
          <div className="space-y-6 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Searching for covers...
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="aspect-[2/3] w-full" />
              <Skeleton className="aspect-[2/3] w-full" />
              <Skeleton className="aspect-[2/3] w-full" />
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <SearchX className="size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">An error occurred while searching for covers.</p>
          </div>
        )}

        {/* No results */}
        {status === "no-results" && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <SearchX className="size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No cover images found from any source.</p>
          </div>
        )}

        {/* Cover Grid */}
        {status === "success" && covers.length > 0 && (
          <div className="overflow-y-auto max-h-[50vh]">
            <div className="grid grid-cols-3 gap-4 py-2">
              {covers.map((cover) => {
                const isSelected = selected?.coverUrl === cover.coverUrl;
                return (
                  <button
                    key={`${cover.provider}-${cover.externalId}`}
                    type="button"
                    aria-label="Select cover"
                    onClick={() => { setSelected(cover); setCustomUrl(""); }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-transparent hover:border-primary/30"
                    }`}
                  >
                    <img
                      src={cover.coverUrl}
                      alt={`Cover from ${PROVIDER_LABELS[cover.provider]}`}
                      className="w-full aspect-[2/3] object-cover bg-muted"
                    />
                    <Badge
                      variant="secondary"
                      className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0"
                    >
                      {PROVIDER_LABELS[cover.provider]}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* URL Import */}
        <div className="border-t pt-4 space-y-2">
          <label htmlFor="cover-url-input" className="text-sm font-medium">
            Or import from URL
          </label>
          <Input
            id="cover-url-input"
            placeholder="Paste image URL..."
            value={customUrl}
            onChange={(e) => { setCustomUrl(e.target.value); setSelected(null); }}
          />
        </div>

        <DialogFooter className="flex items-center sm:justify-end border-t pt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { onOpenChange(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => { void handleApply(); }}
              disabled={applying || !canApply}
            >
              {applying ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Applying...
                </>
              ) : (
                "Apply Cover"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
