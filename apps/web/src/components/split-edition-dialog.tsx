import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

interface EditionFileInfo {
  id: string;
  fileAsset: {
    basename: string;
    mediaKind: string;
    sizeBytes: bigint | number | null;
  };
}

interface SplitEditionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editionFiles: EditionFileInfo[];
  onConfirm: (editionFileIds: string[]) => void;
  confirming: boolean;
}

function formatBytes(bytes: bigint | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SplitEditionDialog({
  open,
  onOpenChange,
  editionFiles,
  onConfirm,
  confirming,
}: SplitEditionDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = selected.size === editionFiles.length;
  const noneSelected = selected.size === 0;
  const canConfirm = !noneSelected && !allSelected && !confirming;

  function toggleFile(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split Edition</DialogTitle>
          <DialogDescription>
            Select files to move to a new edition under this work.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {editionFiles.map((ef) => (
            <label key={ef.id} className="flex items-center gap-3 rounded-md border p-2 cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                role="checkbox"
                checked={selected.has(ef.id)}
                onChange={() => { toggleFile(ef.id); }}
                disabled={confirming}
              />
              <span className="flex-1 text-sm font-medium truncate">{ef.fileAsset.basename}</span>
              <Badge variant="secondary" className="text-xs">{ef.fileAsset.mediaKind}</Badge>
              {ef.fileAsset.sizeBytes !== null && (
                <span className="text-xs text-muted-foreground">{formatBytes(ef.fileAsset.sizeBytes)}</span>
              )}
            </label>
          ))}
        </div>
        {allSelected && (
          <p className="text-sm text-destructive">You must leave at least one file in the original edition.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); }} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={() => { onConfirm([...selected]); }}
            disabled={!canConfirm}
          >
            {confirming ? "Splitting..." : "Split"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
