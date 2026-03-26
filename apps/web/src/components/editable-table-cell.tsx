import { useState } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

interface EditableTableCellProps {
  value: string;
  editing: boolean;
  onSave: (newValue: string) => Promise<void>;
}

export function EditableTableCell({ value, editing, onSave }: EditableTableCellProps) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    if (draft === value) return;
    setSaving(true);
    try {
      await onSave(draft);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return <span>{value || "—"}</span>;
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={() => { void handleBlur(); }}
      disabled={saving}
      className={cn(
        "w-full min-w-0 rounded border-0 bg-transparent px-1 py-0.5 text-sm outline-none",
        "focus-visible:ring-[2px] focus-visible:ring-ring/50",
      )}
    />
  );
}
