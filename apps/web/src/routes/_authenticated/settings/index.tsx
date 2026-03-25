import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  FolderOpen,
  Loader2,
  Monitor,
  Moon,
  OctagonX,
  Play,
  Sun,
  Trash2,
} from "lucide-react";
import { useSSE } from "~/hooks/use-sse";
import { useTheme } from "~/hooks/use-theme";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
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
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AddLibraryRootDialog } from "~/components/settings/add-library-root-dialog";
import {
  getLibraryRootsServerFn,
  getLibraryIssueCountServerFn,
  getScanProgressServerFn,
  removeLibraryRootServerFn,
  scanLibraryRootServerFn,
  type LibraryRootRow,
} from "~/lib/server-fns/library-roots";
import {
  getMissingFileBehaviorServerFn,
  setMissingFileBehaviorServerFn,
  getWorkerConcurrencyServerFn,
  setWorkerConcurrencyServerFn,
  type MissingFileBehavior,
} from "~/lib/server-fns/app-settings";
import type { ThemePreference } from "~/lib/server-fns/app-settings";
import {
  getImportJobsServerFn,
  stopAllJobsServerFn,
  type ImportJobRow,
} from "~/lib/server-fns/import-jobs";
import { runMutation } from "~/lib/mutation";

export interface LibraryRootWithExtras extends LibraryRootRow {
  scanProgress: Awaited<ReturnType<typeof getScanProgressServerFn>> | null;
  issueCount: number;
}

export const Route = createFileRoute("/_authenticated/settings/")({
  loader: async () => {
    const [roots, missingFileBehavior, jobsResult, concurrency] = await Promise.all([
      getLibraryRootsServerFn(),
      getMissingFileBehaviorServerFn(),
      getImportJobsServerFn({ data: { page: 1, pageSize: 100 } }),
      getWorkerConcurrencyServerFn(),
    ]);
    const rootsWithExtras: LibraryRootWithExtras[] = await Promise.all(
      roots.map(async (root) => {
        const [scanProgress, issueCount] = await Promise.all([
          getScanProgressServerFn({ data: { libraryRootId: root.id } }),
          getLibraryIssueCountServerFn({ data: { libraryRootId: root.id } }),
        ]);
        return { ...root, scanProgress, issueCount };
      }),
    );
    return {
      roots: rootsWithExtras,
      missingFileBehavior,
      jobs: jobsResult.jobs,
      totalCount: jobsResult.totalCount,
      concurrency,
    };
  },
  pendingComponent: SettingsSkeleton,
  component: SettingsPage,
});

function SettingsSkeleton() {
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

function SettingsPage() {
  const { roots, missingFileBehavior, jobs, totalCount, concurrency } = Route.useLoaderData();

  const hasActiveScan = roots.some((r) => r.scanProgress !== null);
  const hasActiveJobs = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "RUNNING",
  );
  useSSE({ enabled: hasActiveScan || hasActiveJobs });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="library">
        <TabsList className="h-10">
          <TabsTrigger value="library" className="px-4 py-1.5">Library</TabsTrigger>
          <TabsTrigger value="appearance" className="px-4 py-1.5">Appearance</TabsTrigger>
          <TabsTrigger value="jobs" className="px-4 py-1.5">Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="library" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <LibraryTab roots={roots} missingFileBehavior={missingFileBehavior} />
        </TabsContent>

        <TabsContent value="appearance" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <AppearanceCard />
        </TabsContent>

        <TabsContent value="jobs" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <JobsTab jobs={jobs} totalCount={totalCount} initialConcurrency={concurrency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library Tab
// ---------------------------------------------------------------------------

function LibraryTab({
  roots,
  missingFileBehavior,
}: {
  roots: LibraryRootWithExtras[];
  missingFileBehavior: MissingFileBehavior;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage directories that Bookhouse scans for content.
        </p>
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

      <MissingFileBehaviorCard initialBehavior={missingFileBehavior} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Appearance Tab
// ---------------------------------------------------------------------------

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose how Bookhouse looks to you.
        </p>
        <div className="inline-flex items-center rounded-lg border bg-muted p-1" role="radiogroup" aria-label="Theme">
          {themeOptions.map((option) => {
            const isActive = theme === option.value;
            return (
              <Button
                key={option.value}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                role="radio"
                aria-checked={isActive}
                aria-label={option.label}
                onClick={() => { setTheme(option.value); }}
                className={isActive ? "" : "text-muted-foreground"}
              >
                <option.icon className="size-4" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Jobs Tab
// ---------------------------------------------------------------------------

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "secondary",
  RUNNING: "default",
  SUCCEEDED: "outline",
  FAILED: "destructive",
};

function formatDuration(job: ImportJobRow): string {
  if (!job.startedAt) return "—";
  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${String(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatKind(kind: string): string {
  return kind.replace(/_/g, " ");
}

const jobColumns: ColumnDef<ImportJobRow>[] = [
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status] ?? "secondary"}>
        {row.original.status}
      </Badge>
    ),
    size: 100,
  },
  {
    accessorKey: "kind",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Kind" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline">{formatKind(row.original.kind)}</Badge>
    ),
  },
  {
    id: "libraryRoot",
    header: "Library Root",
    accessorFn: (row) => row.libraryRoot?.name ?? "—",
  },
  {
    id: "created",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    accessorFn: (row) => new Date(row.createdAt).getTime(),
    cell: ({ row }) =>
      formatDistanceToNow(new Date(row.original.createdAt), {
        addSuffix: true,
      }),
    size: 120,
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => formatDuration(row.original),
    size: 80,
  },
  {
    id: "attempts",
    header: "Attempts",
    cell: ({ row }) => row.original.attemptsMade,
    size: 80,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button variant="ghost" size="sm" asChild>
        <Link
          to="/settings/jobs/$jobId"
          params={{ jobId: row.original.id }}
        >
          <ExternalLink className="size-4" />
        </Link>
      </Button>
    ),
    size: 50,
  },
];

function JobsTab({
  jobs,
  totalCount,
  initialConcurrency,
}: {
  jobs: ImportJobRow[];
  totalCount: number;
  initialConcurrency: number;
}) {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [concurrency, setConcurrency] = useState(initialConcurrency);
  const [savingConcurrency, setSavingConcurrency] = useState(false);
  const concurrencyChanged = concurrency !== initialConcurrency;

  async function handleStopAll() {
    if (!window.confirm("Stop all running and queued jobs? This cannot be undone.")) return;
    setStopping(true);
    await runMutation(() => stopAllJobsServerFn(), { success: "All jobs stopped" });
    setStopping(false);
    void router.invalidate();
  }

  async function handleSaveConcurrency() {
    setSavingConcurrency(true);
    await runMutation(
      () => setWorkerConcurrencyServerFn({ data: { concurrency } }),
      { success: `Worker concurrency set to ${String(concurrency)}` },
    );
    setSavingConcurrency(false);
    void router.invalidate();
  }

  return (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">
          Monitor the status of library import and processing jobs.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Concurrency:</label>
            <Input
              type="number"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => { setConcurrency(Number(e.target.value)); }}
              className="w-20"
            />
            {concurrencyChanged && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSaveConcurrency()}
                disabled={savingConcurrency}
              >
                Save
              </Button>
            )}
          </div>
          <Button variant="destructive" size="sm" onClick={() => void handleStopAll()} disabled={stopping}>
            <OctagonX className="mr-2 size-4" />
            Stop All Jobs
          </Button>
        </div>
      </div>
      <VirtualizedDataTable
        columns={jobColumns}
        data={jobs}
        filterColumn="kind"
        filterPlaceholder="Filter by kind..."
        pageSize={20}
      />
      {totalCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {totalCount} total job{totalCount !== 1 ? "s" : ""}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

function MissingFileBehaviorCard({ initialBehavior }: { initialBehavior: MissingFileBehavior }) {
  const [behavior, setBehavior] = useState<MissingFileBehavior>(initialBehavior);
  const [saving, setSaving] = useState(false);

  async function handleChange(value: MissingFileBehavior) {
    setBehavior(value);
    setSaving(true);
    try {
      await setMissingFileBehaviorServerFn({ data: { behavior: value } });
      toast.success("Missing file behavior updated");
    } catch {
      toast.error("Failed to update setting");
      setBehavior(initialBehavior);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing File Behavior</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          When files are no longer found on disk during a scan, choose what happens to their library entries.
        </p>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="missingFileBehavior"
              value="manual"
              checked={behavior === "manual"}
              onChange={() => { void handleChange("manual"); }}
              disabled={saving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium">Manual review</p>
              <p className="text-xs text-muted-foreground">
                Files are marked as missing but kept in the library. You can review and clean them up from the Missing Files page.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="missingFileBehavior"
              value="auto-cleanup"
              checked={behavior === "auto-cleanup"}
              onChange={() => { void handleChange("auto-cleanup"); }}
              disabled={saving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium">Auto-cleanup during scan</p>
              <p className="text-xs text-muted-foreground">
                Missing files and their library entries are automatically removed. Editions with no remaining files are deleted, and works with no remaining editions are deleted.
              </p>
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryRootCard({ root }: { root: LibraryRootWithExtras }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [startingScanButton, setStartingScanButton] = useState<"default" | "full" | null>(null);

  async function handleScan(
    scanMode: "FULL" | "INCREMENTAL",
    startingButton: "default" | "full",
  ) {
    setStartingScanButton(startingButton);
    setScanning(true);
    try {
      const result = await scanLibraryRootServerFn({
        data: { libraryRootId: root.id, scanMode },
      });
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
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start scan",
      );
    } finally {
      setScanning(false);
      setStartingScanButton(null);
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
                onClick={() => { void handleScan(root.scanMode, "default"); }}
                disabled={scanning || root.scanProgress !== null}
              >
                {root.scanProgress ? (
                  root.scanProgress.stale ? (
                    <>
                      <AlertTriangle className="size-4 text-amber-600" />
                      Scan Stalled
                    </>
                  ) : (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Scanning...
                    </>
                  )
                ) : scanning && startingScanButton === "default" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Scan Now
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void handleScan("FULL", "full"); }}
                disabled={scanning || root.scanProgress !== null}
              >
                {scanning && startingScanButton === "full" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Full Scan
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Remove ${root.name}`}
                onClick={() => { setDeleteOpen(true); }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Kind:</span>
              <Badge variant="outline">{root.kind}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Default Scan:</span>
              <Badge variant="outline">{root.scanMode}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Last scanned:</span>
              <span>{lastScanned}</span>
            </div>
            {root.issueCount > 0 && (
              <Link
                to="/settings/library-issues/$libraryRootId"
                params={{ libraryRootId: root.id }}
                className="flex items-center gap-1.5 text-destructive hover:underline"
              >
                <AlertCircle className="size-3.5" />
                <span>{root.issueCount} {root.issueCount === 1 ? "issue" : "issues"}</span>
              </Link>
            )}
          </div>
          {root.scanProgress && (
            <div className="space-y-1.5">
              {root.scanProgress.stale ? (
                <>
                  <Progress
                    value={root.scanProgress.processedFiles ?? 0}
                    max={root.scanProgress.totalFiles ?? 1}
                  />
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    Scan appears stalled — no progress updates received
                  </p>
                </>
              ) : root.scanProgress.scanStage === "PROCESSING" ? (
                <>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    Processing library...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Metadata extraction, cover processing, and edition matching continue automatically in the background.
                  </p>
                </>
              ) : (
                <>
                  <Progress
                    value={root.scanProgress.processedFiles ?? 0}
                    max={root.scanProgress.totalFiles ?? 1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Discovering files... {root.scanProgress.processedFiles ?? 0} / {root.scanProgress.totalFiles ?? "?"} files
                    {root.scanProgress.errorCount ? ` (${String(root.scanProgress.errorCount)} errors)` : ""}
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground/80 italic">
                Books may appear incomplete until the scan finishes. Covers, metadata, and edition matching happen automatically — no action needed on your part.
              </p>
            </div>
          )}
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
