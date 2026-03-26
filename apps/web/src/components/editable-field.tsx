import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  renderAs?: "input" | "textarea";
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  required?: boolean;
}

export function EditableField({
  value,
  onSave,
  renderAs = "input",
  placeholder,
  className,
  inputClassName,
  required = false,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  function startEditing() {
    setDraft(value);
    setEditing(true);
  }

  async function save() {
    const trimmed = draft.trim();
    if (required && trimmed === "") {
      setDraft(value);
      setEditing(false);
      return;
    }

    if (draft === value) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (e.key === "Enter" && renderAs !== "textarea") {
      void save();
    }
  }

  if (!editing) {
    return (
      <div
        className={cn(
          "cursor-pointer rounded px-1 -mx-1 border border-transparent hover:border-border hover:bg-accent/50 transition-colors",
          !value && "text-muted-foreground italic",
          className,
        )}
        onClick={startEditing}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEditing(); }}
      >
        {value || placeholder || "—"}
      </div>
    );
  }

  const sharedProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft(e.target.value); },
    onBlur: () => { void save(); },
    onKeyDown: handleKeyDown,
    disabled: saving,
    autoFocus: true,
    className: cn(
      "w-full min-w-0 rounded border border-input bg-transparent px-1 -mx-1 py-0.5 outline-none transition-colors",
      "focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring/50",
      className,
      inputClassName,
    ),
  };

  if (renderAs === "textarea") {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        rows={3}
        {...sharedProps}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      {...sharedProps}
    />
  );
}
