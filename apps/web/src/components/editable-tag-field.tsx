import { useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

interface EditableTagFieldProps {
  values: string[];
  onSave: (values: string[]) => Promise<void>;
  suggestions?: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function EditableTagField({
  values,
  onSave,
  suggestions = [],
  placeholder,
  required = false,
  className,
}: EditableTagFieldProps) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(values);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = input.length >= 2
    ? suggestions.filter((s) =>
        s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s),
      ).slice(0, 8)
    : [];

  function startEditing() {
    setTags(values);
    setInput("");
    setSelectedIndex(-1);
    setEditing(true);
  }

  function selectSuggestion(name: string) {
    setTags((prev) => [...prev, name]);
    setInput("");
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }

  function addTag() {
    const trimmed = input.trim();
    setTags((prev) => [...prev, trimmed]);
    setInput("");
    setSelectedIndex(-1);
  }

  function removeTag(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    const finalTags = input.trim() ? [...tags, input.trim()] : tags;

    if (required && finalTags.length === 0) {
      setTags(values);
      setInput("");
      setEditing(false);
      return;
    }

    if (JSON.stringify(finalTags) === JSON.stringify(values)) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(finalTags);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setTags(values);
      setInput("");
      setSelectedIndex(-1);
      setEditing(false);
      return;
    }
    if (e.key === "ArrowDown" && filtered.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp" && filtered.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (selectedIndex >= 0 && filtered[selectedIndex]) {
        e.preventDefault();
        selectSuggestion(filtered[selectedIndex]);
        return;
      }
      if (input.trim()) {
        e.preventDefault();
        addTag();
      }
      return;
    }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  if (!editing) {
    const display = values.length > 0 ? values.join(", ") : undefined;
    return (
      <div
        className={cn(
          "cursor-pointer rounded px-1 -mx-1 border border-transparent hover:border-border hover:bg-accent/50 transition-colors",
          !display && "text-muted-foreground italic",
          className,
        )}
        onClick={startEditing}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEditing(); }}
      >
        {display ?? placeholder ?? "—"}
      </div>
    );
  }

  function handleContainerBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    void save();
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-wrap items-center gap-1 rounded border border-input px-1 -mx-1 py-0.5 transition-colors",
        "focus-within:border-ring focus-within:ring-[2px] focus-within:ring-ring/50",
        className,
      )}
      onBlur={handleContainerBlur}
    >
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${String(i)}`}
          className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-sm"
        >
          {tag}
          <button
            type="button"
            aria-label={`remove ${tag}`}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            onClick={() => { removeTag(i); inputRef.current?.focus(); }}
            disabled={saving}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setSelectedIndex(-1); }}
        onKeyDown={handleKeyDown}
        disabled={saving}
        autoFocus
        className="min-w-[80px] flex-1 bg-transparent py-0.5 outline-none text-sm"
        placeholder={tags.length === 0 ? (placeholder ?? "Type and press Enter") : ""}
      />
      {filtered.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {filtered.map((name, i) => (
            <button
              key={name}
              type="button"
              className={cn(
                "block w-full px-3 py-1.5 text-left text-sm hover:bg-accent",
                i === selectedIndex && "bg-accent",
              )}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(name); }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
