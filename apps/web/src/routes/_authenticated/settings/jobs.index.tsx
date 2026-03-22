import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, OctagonX } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getImportJobsServerFn,
  stopAllJobsServerFn,
  type ImportJobRow,
} from "~/lib/server-fns/import-jobs";
import {
  getWorkerConcurrencyServerFn,
  setWorkerConcurrencyServerFn,
} from "~/lib/server-fns/app-settings";
import { runMutation } from "~/lib/mutation";
import { useSSE } from "~/hooks/use-sse";

export const Route = createFileRoute("/_authenticated/settings/jobs/")({
  loader: async () => {
    const [result, concurrency] = await Promise.all([
      getImportJobsServerFn({ data: { page: 1, pageSize: 100 } }),
      getWorkerConcurrencyServerFn(),
    ]);
    return { ...result, concurrency };
  },
  pendingComponent: TablePageSkeleton,
  component: JobsPage,
});

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

const columns: ColumnDef<ImportJobRow>[] = [
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
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => formatDuration(row.original),
  },
  {
    id: "attempts",
    header: "Attempts",
    cell: ({ row }) => row.original.attemptsMade,
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
  },
];

function JobsPage() {
  const { jobs, totalCount, concurrency: initialConcurrency } = Route.useLoaderData();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [concurrency, setConcurrency] = useState(initialConcurrency);
  const [savingConcurrency, setSavingConcurrency] = useState(false);
  const concurrencyChanged = concurrency !== initialConcurrency;

  const hasActiveJobs = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "RUNNING",
  );

  useSSE({ enabled: hasActiveJobs });

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
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Import Jobs</h1>
          <p className="mt-2 text-muted-foreground">
            Monitor the status of library import and processing jobs.
            {hasActiveJobs && (
              <span className="ml-2 text-sm text-blue-600">
                Auto-refreshing...
              </span>
            )}
          </p>
        </div>
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
        columns={columns}
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
    </div>
  );
}
