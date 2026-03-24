import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { addLibraryRootServerFn } from "~/lib/server-fns/library-roots";
import { Plus } from "lucide-react";

export function AddLibraryRootDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [kind, setKind] = useState<"EBOOKS" | "AUDIOBOOKS" | "MIXED">("EBOOKS");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setPath("");
    setKind("EBOOKS");
  }

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addLibraryRootServerFn({ data: { name, path, kind, scanMode: "FULL" } });
      toast.success("Library root added");
      setOpen(false);
      resetForm();
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add library root",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add Library Root
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <DialogHeader>
            <DialogTitle>Add Library Root</DialogTitle>
            <DialogDescription>
              Add a directory to scan for books.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => { setName(e.target.value); }}
                placeholder="My Library"
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="path" className="text-sm font-medium">
                Path
              </label>
              <Input
                id="path"
                value={path}
                onChange={(e) => { setPath(e.target.value); }}
                placeholder="/path/to/books"
                required
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Kind</label>
              <Select value={kind} onValueChange={(v) => { setKind(v as typeof kind); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EBOOKS">Ebooks</SelectItem>
                  <SelectItem value="AUDIOBOOKS">Audiobooks</SelectItem>
                  <SelectItem value="MIXED">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              New libraries start with a full scan. Later scans default to incremental, with a manual full scan option available from the library card.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
