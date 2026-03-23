import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getLibraryIssuesServerFn,
  retryLibraryIssuesServerFn,
} from "~/lib/server-fns/library-roots";

interface IssueItem {
  id: string;
  relativePath: string;
  mediaKind: string;
  metadata: { warnings?: string[] } | null;
  lastSeenAt: Date | string | null;
}

export interface IssuesData {
  items: IssueItem[];
  total: number;
}

export const Route = createFileRoute(
  "/_authenticated/settings/library-issues/$libraryRootId",
)({
  loader: async ({ params }) => {
    const issues = await getLibraryIssuesServerFn({
      data: { libraryRootId: params.libraryRootId, page: 1, pageSize: 50 },
    });
    return {
      libraryRootId: params.libraryRootId,
      issues: issues as IssuesData,
    };
  },
  component: LibraryIssuesPage,
});

function LibraryIssuesPage() {
  const { libraryRootId, issues } = Route.useLoaderData();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  async function handleRetryAll() {
    setRetrying(true);
    try {
      const result = await retryLibraryIssuesServerFn({
        data: { libraryRootId },
      });
      toast.success(
        `Re-parsed ${String(result.retriedCount)} file${result.retriedCount === 1 ? "" : "s"}`,
      );
      void router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to retry issues",
      );
    } finally {
      setRetrying(false);
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
        <h1 className="text-2xl font-bold">Library Issues</h1>
        <div className="flex items-center gap-3">
          {issues.total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleRetryAll(); }}
              disabled={retrying}
            >
              {retrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" />
                  Retry All
                </>
              )}
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {String(issues.total)} total issues
          </span>
        </div>
      </div>

      {issues.items.length === 0 ? (
        <p className="text-muted-foreground">
          No issues found for this library.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Warnings</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.items.map((item) => {
              const warnings = item.metadata?.warnings ?? [];
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">
                    {item.relativePath}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.mediaKind}</Badge>
                  </TableCell>
                  <TableCell>
                    {warnings.length > 0
                      ? warnings.map((w, i) => (
                          <span key={i} className="block text-sm text-destructive">
                            {w}
                          </span>
                        ))
                      : <span className="text-muted-foreground text-sm">-</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.lastSeenAt
                      ? new Date(item.lastSeenAt).toLocaleString()
                      : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
