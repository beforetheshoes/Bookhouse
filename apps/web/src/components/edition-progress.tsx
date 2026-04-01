import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ProgressBar } from "~/components/progress-bar";
import type { WorkDetail } from "~/lib/server-fns/work-detail";

export function progressKindForEdition(formatFamily: string): "EBOOK" | "AUDIO" | "READALOUD" {
  if (formatFamily === "AUDIOBOOK") return "AUDIO";
  return "EBOOK";
}

interface EditionProgressProps {
  progress: { editionId: string; progressKind: string; percent: number | null; source: string | null }[];
  editions: WorkDetail["editions"];
  onUpdate: (editionId: string, percent: number, progressKind: string) => Promise<void>;
}

export function EditionProgress({ progress, editions, onUpdate }: EditionProgressProps) {
  const progressMap = new Map(progress.map((p) => [p.editionId, p]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(editionId: string, progressKind: string) {
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < 0 || val > 100) return;
    setSaving(true);
    try {
      await onUpdate(editionId, val, progressKind);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {editions.map((edition) => {
        const p = progressMap.get(edition.id);
        const percent = p?.percent ?? 0;
        const progressKind = p?.progressKind ?? progressKindForEdition(edition.formatFamily);
        const isEditing = editingId === edition.id;

        return (
          <div key={edition.id} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{edition.formatFamily}</Badge>
              {p?.source && <Badge variant="outline" className="text-xs">via {p.source}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ProgressBar percent={percent} />
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    data-testid={`progress-input-${edition.id}`}
                    type="number"
                    min={0}
                    max={100}
                    value={editValue}
                    onChange={(e) => { setEditValue(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { void handleSave(edition.id, progressKind); }
                      if (e.key === "Escape") { setEditingId(null); }
                    }}
                    className="w-16 rounded border px-2 py-0.5 text-sm text-right"
                    autoFocus
                    disabled={saving}
                  />
                  <span className="text-sm">%</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => { void handleSave(edition.id, progressKind); }}
                    data-testid={`progress-save-${edition.id}`}
                  >
                    {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => { setEditingId(null); }}
                    data-testid={`progress-cancel-${edition.id}`}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground group"
                  onClick={() => { setEditingId(edition.id); setEditValue(String(percent)); }}
                  data-testid={`progress-edit-${edition.id}`}
                  aria-label={`Edit progress for ${edition.formatFamily}`}
                >
                  <span>{String(percent)}%</span>
                  <Pencil className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
