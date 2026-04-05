import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Circle, Loader2, SearchX } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { searchEnrichmentServerFn, applyEnrichmentServerFn, applyCoverFromUrlServerFn } from "~/lib/server-fns/enrichment";
import type { SourceResult, EnrichmentProvider } from "@bookhouse/ingest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  editionId: string | null;
  currentWork: {
    title: string;
    authors: string[];
    description: string | null;
    coverPath: string | null;
    tags: string[];
    editedFields: string[];
  };
  currentEdition: {
    publisher: string | null;
    publishedDate: string | null;
    isbn13: string | null;
    isbn10: string | null;
    language: string | null;
    pageCount: number | null;
    asin: string | null;
    duration: number | null;
    narrators: string[];
    editedFields: string[];
  } | null;
  mode?: "work" | "edition";
  onApplied: () => void;
}

type DialogStatus = "loading" | "error" | "no-results" | "rate-limited" | "success";

export type EnrichmentFieldValue = string | string[] | number | null;

interface FieldSelection {
  workFields: Record<string, EnrichmentFieldValue>;
  editionFields: Record<string, EnrichmentFieldValue>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<EnrichmentProvider, string> = {
  openlibrary: "Open Library",
  googlebooks: "Google Books",
  hardcover: "Hardcover",
  audible: "Audible",
};

interface FieldDef {
  key: string;
  label: string;
  level: "work" | "edition";
}

const WORK_FIELDS: FieldDef[] = [
  { key: "coverUrl", label: "Cover Image", level: "work" },
  { key: "title", label: "Title", level: "work" },
  { key: "authors", label: "Authors", level: "work" },
  { key: "description", label: "Description", level: "work" },
  { key: "subjects", label: "Tags", level: "work" },
];

const EDITION_FIELDS: FieldDef[] = [
  { key: "publisher", label: "Publisher", level: "edition" },
  { key: "publishedDate", label: "Published", level: "edition" },
  { key: "pageCount", label: "Pages", level: "edition" },
  { key: "isbn13", label: "ISBN-13", level: "edition" },
  { key: "isbn10", label: "ISBN-10", level: "edition" },
  { key: "asin", label: "ASIN", level: "edition" },
  { key: "duration", label: "Duration", level: "edition" },
  { key: "narrators", label: "Narrators", level: "edition" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSourceValue(result: SourceResult, field: FieldDef): EnrichmentFieldValue {
  if (field.level === "work") {
    return (result.work as object as Record<string, EnrichmentFieldValue>)[field.key] ?? null;
  }
  return (result.edition as object as Record<string, EnrichmentFieldValue>)[field.key] ?? null;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${String(minutes)}m`;
  if (minutes === 0) return `${String(hours)}h`;
  return `${String(hours)}h ${String(minutes)}m`;
}

function formatValue(value: EnrichmentFieldValue | undefined, fieldKey?: string): string {
  if (value === null || value === undefined) return "";
  if (fieldKey === "duration" && typeof value === "number") return formatDuration(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return "";
}

function getCurrentWorkValue(field: FieldDef, currentWork: EnrichmentDialogProps["currentWork"]): string {
  if (field.key === "title") return currentWork.title;
  if (field.key === "authors") return currentWork.authors.join(", ");
  if (field.key === "description") return currentWork.description ?? "";
  // "subjects"
  return currentWork.tags.join(", ");
}

// Map enrichment field keys to DB column names for editedFields checks
function getEditedFieldKey(fieldKey: string): string {
  if (fieldKey === "title") return "titleDisplay";
  return fieldKey;
}

function getSelection(map: Record<string, FieldSelection>, provider: string): FieldSelection {
  return map[provider] ?? { workFields: {}, editionFields: {} };
}

function countSelected(sel: FieldSelection): number {
  return Object.keys(sel.workFields).length + Object.keys(sel.editionFields).length;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldToggle({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:border-primary/50"
      }`}
      aria-label={selected ? "Deselect field" : "Select field"}
    >
      {selected && <Check className="size-3" />}
      {!selected && <Circle className="size-3 opacity-0" />}
    </button>
  );
}

function FieldComparisonRow({
  field,
  sourceValue,
  currentValue,
  isEdited,
  selected,
  onToggle,
}: {
  field: FieldDef;
  sourceValue: string;
  currentValue: string;
  isEdited: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  if (!sourceValue) return null;

  const matches = sourceValue === currentValue;

  return (
    <div className="group flex gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/30">
      <FieldToggle selected={selected} onClick={onToggle} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{field.label}</span>
          {isEdited && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Edited</Badge>}
          {matches && <span className="text-xs text-muted-foreground italic">Already matches</span>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">Current</div>
            <p className="text-sm text-muted-foreground break-words">{currentValue || "—"}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">Source</div>
            <p className="text-sm break-words">{sourceValue}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverFieldRow({
  coverUrl,
  currentCoverPath,
  selected,
  onToggle,
}: {
  coverUrl: string;
  currentCoverPath: string | null;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="group flex gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/30">
      <FieldToggle selected={selected} onClick={onToggle} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Cover Image</span>
          {currentCoverPath && <span className="text-xs text-muted-foreground italic">Has existing cover</span>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">Current</div>
            {currentCoverPath ? (
              <img
                src={`/api/covers/${currentCoverPath}/thumb`}
                alt="Current cover"
                className="w-16 aspect-[2/3] rounded bg-muted object-cover"
              />
            ) : (
              <div className="w-16 aspect-[2/3] rounded bg-muted flex items-center justify-center">
                <BookOpen className="size-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">Source</div>
            <img
              src={coverUrl}
              alt="Source cover option"
              className="w-16 aspect-[2/3] rounded bg-muted object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceHeader({ result }: { result: SourceResult }) {
  return (
    <div className="flex items-center gap-4 pb-2">
      {result.work.coverUrl ? (
        <img
          src={result.work.coverUrl}
          alt="Source cover"
          className="w-12 aspect-[2/3] rounded bg-muted object-cover"
        />
      ) : (
        <div className="w-12 aspect-[2/3] rounded bg-muted flex items-center justify-center">
          <BookOpen className="size-5 text-muted-foreground" />
        </div>
      )}
      <div>
        <p className="text-sm font-medium">{result.work.title}</p>
        <p className="text-xs text-muted-foreground">{result.externalId}</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Searching sources...
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX className="size-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EnrichmentDialog({
  open,
  onOpenChange,
  workId,
  editionId,
  currentWork,
  currentEdition,
  mode,
  onApplied,
}: EnrichmentDialogProps) {
  const [status, setStatus] = useState<DialogStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState("An error occurred while searching.");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [selections, setSelections] = useState<Record<string, FieldSelection>>({});
  const [applying, setApplying] = useState(false);

  // Auto-search when dialog opens
  useEffect(() => {
    if (!open) return;
    const ctrl = { cancelled: false };

    setStatus("loading");
    setResults([]);
    setSelections({});
    setErrorMsg("An error occurred while searching.");

    void (async () => {
      try {
        const response = await searchEnrichmentServerFn({ data: { workId, editionId: editionId ?? undefined } }) as {
          status: string;
          results?: SourceResult[];
        };

        if (ctrl.cancelled) return;

        if (response.status === "success" && response.results && response.results.length > 0) {
          setResults(response.results);
          setActiveTab((response.results[0] as SourceResult).provider);
          setSelections(buildInitialSelections(response.results, currentWork, currentEdition));
          setStatus("success");
        } else if (response.status === "rate-limited") {
          setStatus("rate-limited");
        } else {
          setStatus("no-results");
        }
      } catch (err) {
        if (ctrl.cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Search failed");
      }
    })();

    return () => { ctrl.cancelled = true; };
  }, [open, workId]);

  const handleToggle = (provider: string, field: FieldDef, value: EnrichmentFieldValue) => {
    setSelections((prev) => {
      const sel = getSelection(prev, provider);
      const target = field.level === "work" ? "workFields" : "editionFields";
      const fields = { ...sel[target] };
      if (field.key in fields) {
        const { [field.key]: _removed, ...rest } = fields;
        void _removed;
        return { ...prev, [provider]: { ...sel, [target]: rest } };
      }
      return { ...prev, [provider]: { ...sel, [target]: { ...fields, [field.key]: value } } };
    });
  };

  const handleApply = async () => {
    const activeResult = results.find((r) => r.provider === activeTab) as SourceResult;
    const sel = getSelection(selections, activeTab);
    setApplying(true);

    try {
      // Handle cover URL separately — it needs download + processing
      const coverUrl = sel.workFields.coverUrl as string | undefined;
      const { coverUrl: _stripped, ...metadataWorkFields } = sel.workFields;
      void _stripped;

      if (coverUrl) {
        await applyCoverFromUrlServerFn({
          data: {
            workId,
            imageUrl: coverUrl,
            source: { provider: activeResult.provider, externalId: activeResult.externalId },
          },
        });
      }

      const hasWork = Object.keys(metadataWorkFields).length > 0;
      const hasEdition = Object.keys(sel.editionFields).length > 0;

      await applyEnrichmentServerFn({
        data: {
          workId,
          editionId: hasEdition && editionId ? editionId : undefined,
          workFields: hasWork ? metadataWorkFields : undefined,
          editionFields: hasEdition ? sel.editionFields : undefined,
          source: { provider: activeResult.provider, externalId: activeResult.externalId },
        },
      });

      toast.success(`Metadata updated from ${PROVIDER_LABELS[activeResult.provider]}`);
      onOpenChange(false);
      onApplied();
    } catch {
      toast.error("Failed to apply metadata");
    } finally {
      setApplying(false);
    }
  };

  const activeSel = getSelection(selections, activeTab);
  const selectedCount = countSelected(activeSel);
  const hasEdition = editionId !== null && currentEdition !== null;
  const showWorkSection = mode !== "edition";
  const showEditionSection = mode !== "work" && hasEdition;
  const dialogTitle = mode === "work" ? "Enrich Work" : mode === "edition" ? "Enrich Edition" : "Enrich Metadata";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Compare data from external sources and choose which fields to apply.
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {status === "loading" && <LoadingSkeleton />}

        {/* Error */}
        {status === "error" && (
          <EmptyState message={errorMsg} />
        )}

        {/* No results */}
        {status === "no-results" && (
          <EmptyState message="No results found from any source for this book." />
        )}

        {/* Rate limited */}
        {status === "rate-limited" && (
          <EmptyState message="Search rate limited. Please try again in a few minutes." />
        )}

        {/* Results */}
        {status === "success" && results.length > 0 && (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0">
              <TabsList>
                {results.map((r) => (
                  <TabsTrigger key={r.provider} value={r.provider}>
                    {PROVIDER_LABELS[r.provider]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {results.map((r) => {
                const sel = getSelection(selections, r.provider);
                return (
                  <TabsContent key={r.provider} value={r.provider} className="overflow-y-auto max-h-[55vh] pr-1">
                    <div className="space-y-6 py-3">
                      <SourceHeader result={r} />

                      {/* Work Data */}
                      {showWorkSection && <div className="space-y-1">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2">
                          Work Data
                        </h3>
                        <div className="space-y-0.5">
                          {WORK_FIELDS.map((field) => {
                            const raw = getSourceValue(r, field);
                            const sourceVal = formatValue(raw);

                            if (field.key === "coverUrl") {
                              if (!sourceVal) return null;
                              return (
                                <CoverFieldRow
                                  key={field.key}
                                  coverUrl={sourceVal}
                                  currentCoverPath={currentWork.coverPath}
                                  selected={field.key in sel.workFields}
                                  onToggle={() => { handleToggle(r.provider, field, raw); }}
                                />
                              );
                            }

                            const currentVal = getCurrentWorkValue(field, currentWork);
                            return (
                              <FieldComparisonRow
                                key={field.key}
                                field={field}
                                sourceValue={sourceVal}
                                currentValue={currentVal}
                                isEdited={currentWork.editedFields.includes(getEditedFieldKey(field.key))}
                                selected={field.key in sel.workFields}
                                onToggle={() => { handleToggle(r.provider, field, raw); }}
                              />
                            );
                          })}
                        </div>
                      </div>}

                      {/* Edition Data */}
                      {showEditionSection && (
                        <>
                          <Separator />
                          <div className="space-y-1">
                            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2">
                              Edition Data
                            </h3>
                            <div className="space-y-0.5">
                              {EDITION_FIELDS.map((field) => {
                                const raw = getSourceValue(r, field);
                                const sourceVal = formatValue(raw, field.key);
                                const currentVal = formatValue(
                                  (currentEdition as Record<string, EnrichmentFieldValue>)[field.key],
                                  field.key,
                                );
                                return (
                                  <FieldComparisonRow
                                    key={field.key}
                                    field={field}
                                    sourceValue={sourceVal}
                                    currentValue={currentVal}
                                    isEdited={currentEdition.editedFields.includes(field.key)}
                                    selected={field.key in sel.editionFields}
                                    onToggle={() => { handleToggle(r.provider, field, raw); }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>

            <DialogFooter className="flex items-center sm:justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {selectedCount} {selectedCount === 1 ? "field" : "fields"} selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { onOpenChange(false); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => { void handleApply(); }}
                  disabled={applying || selectedCount === 0}
                >
                  {applying ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                      Applying...
                    </>
                  ) : (
                    selectedCount > 0 ? `Apply ${String(selectedCount)} Selected` : "Apply Selected"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Selection Builder
// ---------------------------------------------------------------------------

function buildInitialSelections(
  results: SourceResult[],
  currentWork: EnrichmentDialogProps["currentWork"],
  currentEdition: EnrichmentDialogProps["currentEdition"],
): Record<string, FieldSelection> {
  const initial: Record<string, FieldSelection> = {};

  for (const r of results) {
    const sel: FieldSelection = { workFields: {}, editionFields: {} };

    for (const field of WORK_FIELDS) {
      const raw = getSourceValue(r, field);
      const sourceVal = formatValue(raw);
      if (!sourceVal) continue;

      // coverUrl: pre-select only when work has no cover
      if (field.key === "coverUrl") {
        if (!currentWork.coverPath) {
          sel.workFields[field.key] = raw;
        }
        continue;
      }

      if (currentWork.editedFields.includes(getEditedFieldKey(field.key))) continue;
      // Don't pre-select if values already match
      const currentVal = getCurrentWorkValue(field, currentWork);
      if (sourceVal === currentVal) continue;
      sel.workFields[field.key] = raw;
    }

    if (currentEdition) {
      for (const field of EDITION_FIELDS) {
        const raw = getSourceValue(r, field);
        const sourceVal = formatValue(raw, field.key);
        if (!sourceVal) continue;
        if (currentEdition.editedFields.includes(field.key)) continue;
        const currentVal = formatValue((currentEdition as Record<string, EnrichmentFieldValue>)[field.key], field.key);
        if (sourceVal === currentVal) continue;
        sel.editionFields[field.key] = raw;
      }
    }

    initial[r.provider] = sel;
  }

  return initial;
}
