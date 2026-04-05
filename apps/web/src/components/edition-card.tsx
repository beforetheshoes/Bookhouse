import { useState } from "react";
import { ChevronDown, Download, EllipsisVertical, Loader2, Sparkles, TabletSmartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EditableField } from "~/components/editable-field";
import { MetadataItem } from "~/components/metadata-item";
import { updateEditionServerFn, updateEditionNarratorsServerFn } from "~/lib/server-fns/editing";
import { EditableTagField } from "~/components/editable-tag-field";
import { formatDuration } from "~/components/enrichment-dialog";
import { sendToKindleServerFn } from "~/lib/server-fns/kindle";
import type { WorkDetail } from "~/lib/server-fns/work-detail";

type EditionType = WorkDetail["editions"][number];

const KINDLE_COMPATIBLE_MEDIA_KINDS = new Set(["EPUB", "MOBI", "AZW", "AZW3", "PDF"]);
const CONTENT_MEDIA_KINDS = new Set(["EPUB", "MOBI", "AZW", "AZW3", "PDF", "CBZ", "AUDIO"]);

interface EditionCardProps {
  edition: EditionType;
  onEditionFieldSaved: () => void;
  onDeleteEdition: () => void;
  onEnrichEdition: () => void;
  smtpConfigured: boolean;
  kindleConfigured: boolean;
}

export function parseDuration(input: string): number {
  const hMatch = /(\d+)\s*h/.exec(input);
  const mMatch = /(\d+)\s*m/.exec(input);
  if (hMatch ?? mMatch) {
    const hours = hMatch ? parseInt(hMatch[1] as string, 10) : 0;
    const minutes = mMatch ? parseInt(mMatch[1] as string, 10) : 0;
    return hours * 3600 + minutes * 60;
  }
  return parseInt(input, 10) || 0;
}

function formatBytes(bytes: bigint | number | null): string {
  if (bytes === null) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function sortEpubFirst<T extends { fileAsset: { mediaKind: string } }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    if (a.fileAsset.mediaKind === "EPUB") return -1;
    if (b.fileAsset.mediaKind === "EPUB") return 1;
    return 0;
  });
}

export function EditionCard({
  edition,
  onEditionFieldSaved,
  onDeleteEdition,
  onEnrichEdition,
  smtpConfigured,
  kindleConfigured,
}: EditionCardProps) {
  const [sendingKindle, setSendingKindle] = useState(false);

  const canSendToKindle = smtpConfigured && kindleConfigured;
  const contentFiles = edition.editionFiles.filter(
    (ef) => CONTENT_MEDIA_KINDS.has(ef.fileAsset.mediaKind),
  );
  const presentFiles = contentFiles.filter(
    (ef) => ef.fileAsset.availabilityStatus === "PRESENT",
  );
  const kindleFiles = presentFiles.filter(
    (ef) => KINDLE_COMPATIBLE_MEDIA_KINDS.has(ef.fileAsset.mediaKind),
  );
  const isAudiobook = edition.formatFamily === "AUDIOBOOK";

  const ebookDownloadFiles = sortEpubFirst(
    presentFiles.filter((ef) => ef.fileAsset.mediaKind !== "AUDIO"),
  );

  async function saveField(field: string, val: string) {
    await updateEditionServerFn({ data: { editionId: edition.id, fields: { [field]: val || null } } });
    onEditionFieldSaved();
  }

  async function handleSendToKindle() {
    const kindleFile = kindleFiles[0] as EditionType["editionFiles"][number];
    setSendingKindle(true);
    try {
      const result = await sendToKindleServerFn({ data: { editionFileId: kindleFile.id } }) as { success: boolean; error?: string };
      if (result.success) {
        toast.success("Sent to Kindle");
      } else {
        toast.error(result.error ?? "Failed to send to Kindle");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send to Kindle");
    } finally {
      setSendingKindle(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{edition.publisher ?? "Unknown Publisher"}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Edition actions">
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteEdition}
              data-testid={`delete-edition-${edition.id}`}
            >
              <Trash2 className="size-4" />
              Delete Edition
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-6 p-4">
        {/* Actions */}
        <div className="flex justify-end gap-2">
          {isAudiobook && presentFiles.length > 0 && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/editions/download-all/${edition.id}`} download aria-label="Download all audio files">
                <Download className="size-4" />
                Download
              </a>
            </Button>
          )}
          {!isAudiobook && ebookDownloadFiles.length === 1 && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/edition-files/download/${(ebookDownloadFiles[0] as EditionType["editionFiles"][number]).id}`}
                download
                aria-label={`Download ${(ebookDownloadFiles[0] as EditionType["editionFiles"][number]).fileAsset.mediaKind}`}
              >
                <Download className="size-4" />
                Download
              </a>
            </Button>
          )}
          {!isAudiobook && ebookDownloadFiles.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="size-4" />
                  Download
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ebookDownloadFiles.map((ef) => (
                  <DropdownMenuItem key={ef.id} asChild>
                    <a href={`/api/edition-files/download/${ef.id}`} download>
                      {ef.fileAsset.mediaKind}
                      <span className="ml-auto text-muted-foreground text-xs">{formatBytes(ef.fileAsset.sizeBytes)}</span>
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canSendToKindle && kindleFiles.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Send to Kindle"
              disabled={sendingKindle}
              onClick={() => { void handleSendToKindle(); }}
            >
              {sendingKindle ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <TabletSmartphone className="size-4" />
                  Send to Kindle
                </>
              )}
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={onEnrichEdition}>
            <Sparkles className="size-4" />
            Enrich Edition
          </Button>
        </div>

        {/* Publication */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publication</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <MetadataItem label="Publisher">
              <EditableField value={edition.publisher ?? ""} onSave={(val) => saveField("publisher", val)} placeholder="—" />
            </MetadataItem>
            <MetadataItem label="Published">
              <EditableField value={edition.publishedAt ? new Date(edition.publishedAt).toLocaleDateString() : ""} onSave={(val) => saveField("publishedAt", val)} placeholder="—" />
            </MetadataItem>
            <MetadataItem label="Language">
              <EditableField value={edition.language ?? ""} onSave={(val) => saveField("language", val)} placeholder="—" />
            </MetadataItem>
          </div>
        </div>

        {/* Identifiers */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identifiers</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <MetadataItem label="ISBN-13">
              <EditableField value={edition.isbn13 ?? ""} onSave={(val) => saveField("isbn13", val)} placeholder="—" />
            </MetadataItem>
            <MetadataItem label="ISBN-10">
              <EditableField value={edition.isbn10 ?? ""} onSave={(val) => saveField("isbn10", val)} placeholder="—" />
            </MetadataItem>
            <MetadataItem label="ASIN">
              <EditableField value={edition.asin ?? ""} onSave={(val) => saveField("asin", val)} placeholder="—" />
            </MetadataItem>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <MetadataItem label="Pages">
              <EditableField value={edition.pageCount != null ? String(edition.pageCount) : ""} onSave={(val) => saveField("pageCount", val)} placeholder="—" />
            </MetadataItem>
            {(edition.duration != null || isAudiobook) && (
              <MetadataItem label="Duration">
                <EditableField
                  value={edition.duration != null ? formatDuration(edition.duration) : ""}
                  onSave={(val) => saveField("duration", val ? String(parseDuration(val)) : "")}
                  placeholder="—"
                />
              </MetadataItem>
            )}
          </div>
        </div>

        {/* Authors */}
        {edition.contributors.filter((c) => c.role === "AUTHOR").length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Authors</h4>
            <div className="text-sm space-y-0.5">
              {edition.contributors.filter((c) => c.role === "AUTHOR").map((c) => (
                <div key={`${c.role}-${c.contributor.nameDisplay}`}>
                  {c.contributor.nameDisplay}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Narrators */}
        {(edition.contributors.some((c) => c.role === "NARRATOR") || isAudiobook) && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Narrators</h4>
            <EditableTagField
              values={edition.contributors.filter((c) => c.role === "NARRATOR").map((c) => c.contributor.nameDisplay)}
              onSave={async (names) => {
                await updateEditionNarratorsServerFn({ data: { editionId: edition.id, narrators: names } });
                onEditionFieldSaved();
              }}
              placeholder="No narrators"
            />
          </div>
        )}

        {/* Files */}
        {contentFiles.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</h4>
            <div className="space-y-1 text-sm">
              {contentFiles.map((ef) => (
                <div key={ef.id} className="flex items-center gap-2">
                  <span className="font-mono text-xs">{ef.fileAsset.basename}</span>
                  <span className="text-muted-foreground">
                    {formatBytes(ef.fileAsset.sizeBytes)}
                  </span>
                  <Badge
                    variant={ef.fileAsset.availabilityStatus === "PRESENT" ? "outline" : "destructive"}
                    className="text-[10px]"
                  >
                    {ef.fileAsset.availabilityStatus}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
