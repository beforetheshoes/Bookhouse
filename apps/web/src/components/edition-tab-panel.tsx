import { Download, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { EditableField } from "~/components/editable-field";
import { MetadataItem } from "~/components/metadata-item";
import { updateEditionServerFn } from "~/lib/server-fns/editing";
import type { WorkDetail } from "~/lib/server-fns/work-detail";

type EditionType = WorkDetail["editions"][number];

interface EditionTabPanelProps {
  edition: EditionType;
  isLastEdition: boolean;
  onEditionFieldSaved: () => void;
  onDeleteEdition: () => void;
}

function formatBytes(bytes: bigint | number | null): string {
  if (bytes === null) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function EditionTabPanel({
  edition,
  onEditionFieldSaved,
  onDeleteEdition,
}: EditionTabPanelProps) {
  async function saveField(field: string, val: string) {
    await updateEditionServerFn({ data: { editionId: edition.id, fields: { [field]: val || null } } });
    onEditionFieldSaved();
  }

  return (
    <div className="space-y-6 py-4">
      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <MetadataItem label="Publisher">
          <EditableField value={edition.publisher ?? ""} onSave={(val) => saveField("publisher", val)} placeholder="—" />
        </MetadataItem>
        <MetadataItem label="Published">
          <EditableField value={edition.publishedAt ? new Date(edition.publishedAt).toLocaleDateString() : ""} onSave={(val) => saveField("publishedAt", val)} placeholder="—" />
        </MetadataItem>
        <MetadataItem label="Pages">
          <EditableField value={edition.pageCount != null ? String(edition.pageCount) : ""} onSave={(val) => saveField("pageCount", val)} placeholder="—" />
        </MetadataItem>
        <MetadataItem label="ISBN-13">
          <EditableField value={edition.isbn13 ?? ""} onSave={(val) => saveField("isbn13", val)} placeholder="—" />
        </MetadataItem>
        <MetadataItem label="ISBN-10">
          <EditableField value={edition.isbn10 ?? ""} onSave={(val) => saveField("isbn10", val)} placeholder="—" />
        </MetadataItem>
        <MetadataItem label="ASIN">
          <EditableField value={edition.asin ?? ""} onSave={(val) => saveField("asin", val)} placeholder="—" />
        </MetadataItem>
        <MetadataItem label="Language">
          <EditableField value={edition.language ?? ""} onSave={(val) => saveField("language", val)} placeholder="—" />
        </MetadataItem>
      </div>

      {/* Contributors */}
      {edition.contributors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contributors</div>
          <div className="text-sm space-y-0.5">
            {edition.contributors.map((c) => (
              <div key={`${c.role}-${c.contributor.nameDisplay}`}>
                <span className="text-muted-foreground">{c.role}: </span>
                {c.contributor.nameDisplay}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      {edition.editionFiles.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</div>
          <div className="space-y-1 text-sm">
            {(() => {
              const CONTENT_MEDIA_KINDS = new Set(["EPUB", "PDF", "CBZ", "AUDIO"]);
              const contentFiles = edition.editionFiles.filter(
                (ef) => CONTENT_MEDIA_KINDS.has(ef.fileAsset.mediaKind),
              );
              const presentFiles = contentFiles.filter(
                (ef) => ef.fileAsset.availabilityStatus === "PRESENT",
              );
              const multiplePresent = presentFiles.length > 1;
              return contentFiles.map((ef) => (
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
              )).concat(
                multiplePresent ? [
                  <a
                    key="download-all"
                    href={`/api/editions/${edition.id}/download-all`}
                    download
                    aria-label={`Download all (${String(presentFiles.length)} files)`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-foreground hover:bg-accent transition-colors w-fit"
                  >
                    <Download className="size-3.5" />
                    Download all ({presentFiles.length} files)
                  </a>,
                ] : presentFiles.map((ef) => (
                  <a
                    key={`dl-${ef.id}`}
                    href={`/api/edition-files/${ef.id}/download`}
                    download
                    aria-label={`Download ${ef.fileAsset.basename}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-foreground hover:bg-accent transition-colors w-fit"
                  >
                    <Download className="size-3.5" />
                    Download
                  </a>
                )),
              );
            })()}
          </div>
        </div>
      )}

      {/* Delete */}
      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          size="sm"
          data-testid={`delete-edition-${edition.id}`}
          aria-label="Delete edition"
          onClick={onDeleteEdition}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5 mr-1.5" />
          Delete Edition
        </Button>
      </div>
    </div>
  );
}
