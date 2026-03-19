import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  getImportJobDetailServerFn,
  type ImportJobDetail,
} from "~/lib/server-fns/import-jobs";

export const Route = createFileRoute(
  "/_authenticated/settings/jobs/$jobId",
)({
  loader: async ({ params }) => {
    const job = await getImportJobDetailServerFn({
      data: { id: params.jobId },
    });
    return { job };
  },
  pendingComponent: JobDetailSkeleton,
  component: JobDetailPage,
});

function JobDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  QUEUED: "secondary",
  RUNNING: "default",
  SUCCEEDED: "outline",
  FAILED: "destructive",
};

function formatDuration(job: ImportJobDetail): string {
  if (!job.startedAt) return "—";
  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${String(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function JobDetailPage() {
  const { job } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings/jobs">
            <ArrowLeft className="size-4" />
            Back to Jobs
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Job Detail
            <Badge variant={statusVariant[job.status] ?? "secondary"}>
              {job.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">ID</span>
              <p className="font-mono text-xs">{job.id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Kind</span>
              <p>
                <Badge variant="outline">
                  {job.kind.replace(/_/g, " ")}
                </Badge>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Library Root</span>
              <p>{job.libraryRoot?.name ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">BullMQ Job ID</span>
              <p className="font-mono text-xs">{job.bullmqJobId ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <p>{new Date(job.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Started</span>
              <p>
                {job.startedAt
                  ? new Date(job.startedAt).toLocaleString()
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Finished</span>
              <p>
                {job.finishedAt
                  ? new Date(job.finishedAt).toLocaleString()
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p>{formatDuration(job)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Attempts Made</span>
              <p>{job.attemptsMade}</p>
            </div>
          </div>

          {job.error && (
            <div>
              <span className="text-sm text-muted-foreground">Error</span>
              <pre className="mt-1 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {job.error}
              </pre>
            </div>
          )}

          {job.payload && (
            <div>
              <span className="text-sm text-muted-foreground">Payload</span>
              <pre className="mt-1 rounded-md border bg-muted/50 p-3 text-sm">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
