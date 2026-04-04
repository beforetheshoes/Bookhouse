import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import {
  getLibraryHealthServerFn,
  getOrphanedFilesServerFn,
  deleteOrphanedFileServerFn,
  getEmptyWorksServerFn,
  deleteEmptyWorksServerFn,
  type OrphanedFile,
  type EmptyWork,
} from "~/lib/server-fns/library-health";
import { runMutation } from "~/lib/mutation";
import {
  Activity,
  Image,
  Hash,
  Copy,
  FileQuestion,
  Ghost,
  Link2,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/health")({
  loader: async () => {
    const [health, orphanedFiles, emptyWorks] = await Promise.all([
      getLibraryHealthServerFn(),
      getOrphanedFilesServerFn(),
      getEmptyWorksServerFn(),
    ]);
    return { health, orphanedFiles, emptyWorks };
  },
  pendingComponent: TablePageSkeleton,
  component: HealthPage,
});

interface HealthCheck {
  key: string;
  label: string;
  description: string;
  count: number;
  total?: number;
  icon: React.ElementType;
  href?: string;
}

function checkScore(check: HealthCheck): number {
  if (check.total !== undefined && check.total > 0) {
    return (1 - check.count / check.total) * 100;
  }
  return check.count === 0 ? 100 : 0;
}

function computeHealthScore(checks: HealthCheck[]): number {
  const total = checks.reduce((sum, c) => sum + checkScore(c), 0);
  return Math.round(total / checks.length);
}

function OrphanedFilesList({ files }: { files: OrphanedFile[] }) {
  const router = useRouter();

  async function handleDelete(fileAssetId: string) {
    await runMutation(
      () => deleteOrphanedFileServerFn({ data: { fileAssetId } }),
      { success: "File removed" },
    );
    await router.invalidate();
  }

  if (files.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">No orphaned files</p>
    );
  }

  return (
    <ul className="mt-3 space-y-1">
      {files.map((file) => (
        <li key={file.id} className="flex items-start justify-between gap-2 text-sm">
          <span className="break-all text-muted-foreground">{file.relativePath}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${file.relativePath}`}
            onClick={() => void handleDelete(file.id)}
          >
            <Trash2 className="size-3" />
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
}

function EmptyWorksList({ works }: { works: EmptyWork[] }) {
  const router = useRouter();

  async function handleDeleteAll() {
    await runMutation(
      () => deleteEmptyWorksServerFn(),
      { success: "Empty works removed" },
    );
    await router.invalidate();
  }

  if (works.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No empty works</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      <Button
        variant="destructive"
        size="sm"
        onClick={() => { void handleDeleteAll(); }}
        data-testid="delete-empty-works-btn"
      >
        <Trash2 className="mr-1.5 size-3.5" />
        {`Delete all ${String(works.length)} empty work${works.length === 1 ? "" : "s"}`}
      </Button>
      <ul className="space-y-1">
        {works.map((work) => (
          <li key={work.id} className="text-sm text-muted-foreground">{work.titleDisplay}</li>
        ))}
      </ul>
    </div>
  );
}

function HealthPage() {
  const { health, orphanedFiles, emptyWorks } = Route.useLoaderData();

  if (health.totalWorks === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <Activity className="size-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No works in your library</h2>
        <p className="text-muted-foreground">
          Add some books to see your library health report.
        </p>
      </div>
    );
  }

  const checks: HealthCheck[] = [
    {
      key: "missingCover",
      label: "Missing Covers",
      description: "Books without cover images",
      count: health.checks.missingCover.count,
      total: health.checks.missingCover.total,
      icon: Image,
    },
    {
      key: "noIsbn",
      label: "Missing ISBN",
      description: "Books where no edition has an ISBN",
      count: health.checks.noIsbn.count,
      total: health.checks.noIsbn.total,
      icon: Hash,
    },
    {
      key: "pendingDuplicates",
      label: "Pending Duplicates",
      description: "Duplicate candidates awaiting review",
      count: health.checks.pendingDuplicates.count,
      icon: Copy,
      href: "/duplicates",
    },
    {
      key: "orphanedFiles",
      label: "Orphaned Files",
      description: "Files not linked to any book",
      count: health.checks.orphanedFiles.count,
      icon: FileQuestion,
    },
    {
      key: "pendingMatchSuggestions",
      label: "Pending Matches",
      description: "Match suggestions awaiting review",
      count: health.checks.pendingMatchSuggestions.count,
      icon: Link2,
      href: "/match-suggestions",
    },
{
      key: "emptyWorks",
      label: "Empty Works",
      description: "Works with no file attached",
      count: health.checks.emptyWorks.count,
      icon: Ghost,
    },
  ];

  const healthScore = computeHealthScore(checks);
  const totalIssues = checks.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
        <strong>Experimental.</strong> This page is a work in progress — counts may be misleading and some checks are not yet actionable.
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Library Health</h1>
          <p className="text-muted-foreground">
            {totalIssues === 0
              ? "Your library is in great shape!"
              : `${String(totalIssues)} issue${totalIssues === 1 ? "" : "s"} found across ${String(health.totalWorks)} works`}
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center"
          data-testid="health-score"
        >
          <span className="text-4xl font-bold">{healthScore}%</span>
          <span className="text-sm text-muted-foreground">Health Score</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <Card key={check.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {check.label}
              </CardTitle>
              <check.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{check.count}</div>
              <CardDescription>{check.description}</CardDescription>

              {/* Dedicated-page link for Duplicates and Match Suggestions */}
              {check.count > 0 && check.href && (
                <Link
                  to={check.href}
                  className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
                >
                  Review
                </Link>
              )}

              {/* Inline orphaned files list */}
              {check.key === "orphanedFiles" && (
                <OrphanedFilesList files={orphanedFiles} />
              )}

              {/* Inline empty works list */}
              {check.key === "emptyWorks" && (
                <EmptyWorksList works={emptyWorks} />
              )}

            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
