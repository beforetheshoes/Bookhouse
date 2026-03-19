import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import { VirtualizedDataTable, DataTableColumnHeader } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getImportJobsServerFn,
  type ImportJobRow,
} from "~/lib/server-fns/import-jobs";
import { useSSE } from "~/hooks/use-sse";

export const Route = createFileRoute("/_authenticated/settings/jobs")({
  loader: async () => {
    const result = await getImportJobsServerFn({
      data: { page: 1, pageSize: 100 },
    });
    return result;
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
  const { jobs, totalCount } = Route.useLoaderData();

  const hasActiveJobs = jobs.some(
    (j) => j.status === "QUEUED" || j.status === "RUNNING",
  );

  useSSE({ enabled: hasActiveJobs });

  return (
    <div>
      <div className="mb-6">
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
