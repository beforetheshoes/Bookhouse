import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { bulkEnrichServerFn } from "~/lib/server-fns/bulk-enrich";
import { getIntegrationStatusServerFn } from "~/lib/server-fns/integrations";

type EnrichmentProvider = "openlibrary" | "googlebooks" | "hardcover" | "audible";
type MergeStrategy = "fullest" | "priority";

interface SourceStatus {
  configured: boolean;
  label: string;
}

interface BulkEnrichDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  selectedWorkIds: string[];
  onStarted: () => void;
}

const SOURCE_ORDER: EnrichmentProvider[] = ["openlibrary", "googlebooks", "hardcover", "audible"];

export function BulkEnrichDialog({
  open,
  onOpenChange,
  selectedCount,
  selectedWorkIds,
  onStarted,
}: BulkEnrichDialogProps) {
  const [sources, setSources] = useState<Record<string, SourceStatus>>({});
  const [selectedSources, setSelectedSources] = useState<Set<EnrichmentProvider>>(new Set(["openlibrary"]));
  const [strategy, setStrategy] = useState<MergeStrategy>("fullest");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = { cancelled: false };

    void (async () => {
      const status = await getIntegrationStatusServerFn();
      if (!ctrl.cancelled) {
        setSources(status);
        // Pre-select all configured sources
        const configured = SOURCE_ORDER.filter((s) => status[s]?.configured); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- status[s] may be undefined before load
        setSelectedSources(new Set(configured.length > 0 ? configured : ["openlibrary"]));
      }
    })();

    return () => { ctrl.cancelled = true; };
  }, [open]);

  const toggleSource = (source: EnrichmentProvider) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const orderedSources = SOURCE_ORDER.filter((s) => selectedSources.has(s));
      const result = await bulkEnrichServerFn({
        data: {
          workIds: selectedWorkIds,
          sources: orderedSources,
          strategy,
        },
      });
      toast.success(`Enrichment started for ${String(result.enqueuedCount)} work${result.enqueuedCount === 1 ? "" : "s"}`);
      onOpenChange(false);
      onStarted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start enrichment");
    } finally {
      setSubmitting(false);
    }
  };

  const hasSelectedSources = selectedSources.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Wand2 className="inline-block mr-2 size-5" />
            Enrich {selectedCount} Work{selectedCount === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Fills in missing metadata from external sources. Existing data and manual edits are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Sources */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Sources</h3>
            <div className="space-y-1.5">
              {SOURCE_ORDER.map((source) => {
                const status = sources[source];
                const configured = status?.configured ?? (source === "openlibrary");
                const label = status?.label ?? source;
                return (
                  <label key={source} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSources.has(source)}
                      onChange={() => { toggleSource(source); }}
                      disabled={!configured}
                      className="rounded border-input"
                      aria-label={label}
                    />
                    <span className={!configured ? "text-muted-foreground" : ""}>{label}</span>
                    {!configured && <span className="text-xs text-muted-foreground">(Not configured)</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Strategy */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Merge Strategy</h3>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="strategy"
                  value="fullest"
                  checked={strategy === "fullest"}
                  onChange={() => { setStrategy("fullest"); }}
                  aria-label="Fullest data"
                />
                <div>
                  <span className="font-medium">Fullest data</span>
                  <p className="text-xs text-muted-foreground">For each field, pick the source with the most detailed value.</p>
                </div>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="strategy"
                  value="priority"
                  checked={strategy === "priority"}
                  onChange={() => { setStrategy("priority"); }}
                  aria-label="Priority order"
                />
                <div>
                  <span className="font-medium">Priority order</span>
                  <p className="text-xs text-muted-foreground">First source with data wins, in the order shown above.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            onClick={() => { void handleSubmit(); }}
            disabled={submitting || !hasSelectedSources}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Starting...
              </>
            ) : (
              "Start Enrichment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
