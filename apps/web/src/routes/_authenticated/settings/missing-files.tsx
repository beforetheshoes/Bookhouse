import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getMissingFilesServerFn,
  cleanupMissingFilesServerFn,
} from "~/lib/server-fns/deletion";

interface MissingFileItem {
  id: string;
  relativePath: string;
  mediaKind: string;
  lastSeenAt: Date | string | null;
  editionFiles: {
    edition: {
      id: string;
      formatFamily: string;
      work: { id: string; titleDisplay: string };
    };
  }[];
}

export interface MissingFilesData {
  items: MissingFileItem[];
  total: number;
}

export const Route = createFileRoute(
  "/_authenticated/settings/missing-files",
)({
  loader: async () => {
    const data = await getMissingFilesServerFn({
      data: { page: 1, pageSize: 100 },
    });
    return { missingFiles: data as MissingFilesData };
  },
  component: MissingFilesPage,
});

function MissingFilesPage() {
  const { missingFiles } = Route.useLoaderData();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanAllOpen, setCleanAllOpen] = useState(false);

  function toggleSelect(id: string) {
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

  function toggleSelectAll() {
    if (selected.size === missingFiles.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(missingFiles.items.map((f) => f.id)));
    }
  }

  async function handleCleanup(fileAssetIds: string[]) {
    setCleaning(true);
    try {
      const result = await cleanupMissingFilesServerFn({
        data: { fileAssetIds },
      });
      const total = result.deletedEditionIds.length + result.deletedWorkIds.length + result.deletedEditionFileCount;
      toast.success(`Cleaned up ${String(total)} record${total === 1 ? "" : "s"}`);
      setSelected(new Set());
      setCleanupOpen(false);
      setCleanAllOpen(false);
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to clean up files",
      );
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/settings/libraries"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Libraries
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Missing Files</h1>
          <p className="text-sm text-muted-foreground">
            These files were not found during the last scan. Cleaning up removes their library entries. Files on disk are not affected.
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setCleanupOpen(true); }}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Clean Up Selected ({selected.size})
            </Button>
          )}
          {missingFiles.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCleanAllOpen(true); }}
            >
              Clean Up All
            </Button>
          )}
        </div>
      </div>

      {missingFiles.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No missing files found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={selected.size === missingFiles.items.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>File Path</TableHead>
              <TableHead>Work</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missingFiles.items.map((file) => {
              const edition = file.editionFiles[0]?.edition;
              return (
                <TableRow key={file.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(file.id)}
                      onChange={() => { toggleSelect(file.id); }}
                      aria-label={`Select ${file.relativePath}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{file.relativePath}</TableCell>
                  <TableCell>
                    {edition ? (
                      <Link to="/library/$workId" params={{ workId: edition.work.id }} search={{ page: 1, pageSize: 50, sort: "title-asc" as const }} className="hover:underline">
                        {edition.work.titleDisplay}
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{file.mediaKind}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {file.lastSeenAt ? new Date(file.lastSeenAt).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean Up {selected.size} File{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              This will remove the selected missing files and any editions or works that become empty as a result.
              Files on disk are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCleanupOpen(false); }} disabled={cleaning}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => { void handleCleanup([...selected]); }} disabled={cleaning}>
              {cleaning ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Cleaning...</> : "Clean Up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cleanAllOpen} onOpenChange={setCleanAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean Up All {missingFiles.total} Missing File{missingFiles.total === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              This will remove all missing files and any editions or works that become empty as a result.
              Files on disk are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCleanAllOpen(false); }} disabled={cleaning}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => { void handleCleanup(missingFiles.items.map((f) => f.id)); }} disabled={cleaning}>
              {cleaning ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Cleaning...</> : "Clean Up All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
