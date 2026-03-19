import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { FolderOpen, Play, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { AddLibraryRootDialog } from "~/components/settings/add-library-root-dialog";
import {
  getLibraryRootsServerFn,
  removeLibraryRootServerFn,
  scanLibraryRootServerFn,
  type LibraryRootRow,
} from "~/lib/server-fns/library-roots";

export const Route = createFileRoute("/_authenticated/settings/libraries")({
  loader: async () => {
    const roots = await getLibraryRootsServerFn();
    return { roots };
  },
  pendingComponent: LibrariesSkeleton,
  component: LibrariesPage,
});

function LibrariesSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-9 w-40" />
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

function LibrariesPage() {
  const { roots } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Library Roots</h1>
          <p className="text-sm text-muted-foreground">
            Manage directories that Bookhouse scans for content.
          </p>
        </div>
        <AddLibraryRootDialog />
      </div>

      {roots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="size-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No library roots configured. Add one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {roots.map((root) => (
            <LibraryRootCard key={root.id} root={root} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryRootCard({ root }: { root: LibraryRootRow }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      const result = await scanLibraryRootServerFn({ data: { libraryRootId: root.id } });
      toast.success(`Scan started for "${root.name}"`, {
        action: {
          label: "View Job",
          onClick: () => {
            void router.navigate({
              to: "/settings/jobs/$jobId",
              params: { jobId: result.importJobId },
            });
          },
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start scan",
      );
    } finally {
      setScanning(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await removeLibraryRootServerFn({ data: { id: root.id } });
      toast.success(`"${root.name}" removed`);
      setDeleteOpen(false);
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove library root",
      );
    } finally {
      setDeleting(false);
    }
  }

  const lastScanned = root.lastScannedAt
    ? new Date(root.lastScannedAt).toLocaleString()
    : "Never";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {root.name}
                {!root.isEnabled && (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground font-mono">
                {root.path}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void handleScan(); }}
                disabled={scanning}
              >
                <Play className="size-4" />
                {scanning ? "Starting..." : "Scan Now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setDeleteOpen(true); }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Kind:</span>
              <Badge variant="outline">{root.kind}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Scan Mode:</span>
              <Badge variant="outline">{root.scanMode}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Last scanned:</span>
              <span>{lastScanned}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Library Root</DialogTitle>
            <DialogDescription>
              This will remove "{root.name}" and all associated file records.
              The actual files on disk will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteOpen(false); }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { void handleDelete(); }}
              disabled={deleting}
            >
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
