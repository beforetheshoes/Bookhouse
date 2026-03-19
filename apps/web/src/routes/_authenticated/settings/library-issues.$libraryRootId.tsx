import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getLibraryIssuesServerFn } from "~/lib/server-fns/library-roots";

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
  const { issues } = Route.useLoaderData();

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
        <span className="text-sm text-muted-foreground">
          {String(issues.total)} total issues
        </span>
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
