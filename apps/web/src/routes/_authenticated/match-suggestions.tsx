import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { LayoutGrid, Table2 } from "lucide-react";
import { toast } from "sonner";
import { VirtualizedDataTable } from "~/components/data-table/virtualized-data-table";
import { DataTableColumnHeader } from "~/components/data-table/data-table-column-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import { runMutation } from "~/lib/mutation";
import {
  getMatchSuggestionsServerFn,
  acceptMatchSuggestionServerFn,
  declineMatchSuggestionServerFn,
  rematchAllServerFn,
  type MatchSuggestionRow,
} from "~/lib/server-fns/match-suggestions";

export const Route = createFileRoute("/_authenticated/match-suggestions")({
  loader: async () => {
    const matchSuggestions = await getMatchSuggestionsServerFn();
    return { matchSuggestions };
  },
  pendingComponent: TablePageSkeleton,
  component: MatchSuggestionsPage,
});

type StatusTab = "ALL" | "PENDING" | "CONFIRMED" | "IGNORED";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IGNORED", label: "Ignored" },
];

type SortOption = "title-asc" | "title-desc" | "author-asc" | "author-desc" | "date-desc" | "date-asc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
  { value: "author-asc", label: "Author A–Z" },
  { value: "author-desc", label: "Author Z–A" },
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
];

function sortLinks(links: MatchSuggestionRow[], sort: SortOption): MatchSuggestionRow[] {
  const sorted = [...links];
  sorted.sort((a: MatchSuggestionRow, b: MatchSuggestionRow) => {
    switch (sort) {
      case "title-asc":
        return a.targetWork.titleDisplay.localeCompare(b.targetWork.titleDisplay);
      case "title-desc":
        return b.targetWork.titleDisplay.localeCompare(a.targetWork.titleDisplay);
      case "author-asc": {
        const authA = getContributorsByRole(a.targetWork.editions, "AUTHOR") || "\uffff";
        const authB = getContributorsByRole(b.targetWork.editions, "AUTHOR") || "\uffff";
        return authA.localeCompare(authB);
      }
      case "author-desc": {
        const authA = getContributorsByRole(a.targetWork.editions, "AUTHOR") || "";
        const authB = getContributorsByRole(b.targetWork.editions, "AUTHOR") || "";
        return authB.localeCompare(authA);
      }
      case "date-desc":
        return new Date(b.targetWork.createdAt).getTime() - new Date(a.targetWork.createdAt).getTime();
      case "date-asc":
        return new Date(a.targetWork.createdAt).getTime() - new Date(b.targetWork.createdAt).getTime();
    }
  });
  return sorted;
}

function formatConfidence(val: number | null): string {
  if (val == null) return "—";
  return `${String(Math.round(val * 100))}%`;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  IGNORED: "secondary",
  CONFIRMED: "default",
};

type EditionWithContributors = MatchSuggestionRow["targetWork"]["editions"][number];

function getContributorsByRole(editions: EditionWithContributors[], role: string): string {
  return editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === role)
    .map((c) => c.contributor.nameDisplay)
    .join(", ");
}

type WorkSide = MatchSuggestionRow["targetWork"] | MatchSuggestionRow["suggestedWork"];

function getWorkFolder(work: WorkSide): string | null {
  const allFiles = work.editions.flatMap((e) => e.editionFiles);
  const anyFile = allFiles[0];
  if (!anyFile) return null;
  const parts = anyFile.fileAsset.absolutePath.split("/");
  parts.pop();
  return parts.join("/");
}

function getWorkFileCount(work: WorkSide): number {
  return work.editions.flatMap((e) => e.editionFiles).length;
}

function getWorkFormatFamilies(work: WorkSide): string[] {
  const families = new Set(work.editions.map((e) => e.formatFamily).filter(Boolean));
  return [...families];
}

type ViewMode = "card" | "table";

function createColumns(
  onAccept: (id: string, survivingWorkId: string) => void,
  onDecline: (id: string) => void,
): ColumnDef<MatchSuggestionRow>[] {
  return [
    {
      id: "workA",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Work A" />
      ),
      accessorFn: (row) => row.targetWork.titleDisplay,
      cell: ({ row }) => {
        const authors = getContributorsByRole(row.original.targetWork.editions, "AUTHOR");
        return (
          <div>
            <p>{row.original.targetWork.titleDisplay}</p>
            {authors && <p className="text-xs text-muted-foreground">{authors}</p>}
          </div>
        );
      },
      size: 280,
    },
    {
      id: "workB",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Work B" />
      ),
      accessorFn: (row) => row.suggestedWork.titleDisplay,
      cell: ({ row }) => {
        const authors = getContributorsByRole(row.original.suggestedWork.editions, "AUTHOR");
        return (
          <div>
            <p>{row.original.suggestedWork.titleDisplay}</p>
            {authors && <p className="text-xs text-muted-foreground">{authors}</p>}
          </div>
        );
      },
      size: 280,
    },
    {
      id: "matchType",
      header: "Match",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.matchType}</Badge>
      ),
      size: 140,
    },
    {
      id: "confidence",
      header: "Conf.",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatConfidence(row.original.confidence)}
        </span>
      ),
      size: 60,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.reviewStatus] ?? "outline"}>
          {row.original.reviewStatus}
        </Badge>
      ),
      size: 100,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        if (row.original.reviewStatus !== "PENDING") return null;
        return (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => { onAccept(row.original.id, row.original.targetWorkId); }}>
              Keep A
            </Button>
            <Button size="sm" onClick={() => { onAccept(row.original.id, row.original.suggestedWorkId); }}>
              Keep B
            </Button>
            <Button variant="outline" size="sm" onClick={() => { onDecline(row.original.id); }}>
              Decline
            </Button>
          </div>
        );
      },
      size: 220,
    },
  ];
}

function WorkPanel({ work, label }: { work: WorkSide; label: string }) {
  const title = work.titleDisplay;
  const authors = getContributorsByRole(work.editions, "AUTHOR");
  const narrators = getContributorsByRole(work.editions, "NARRATOR");
  const formats = getWorkFormatFamilies(work);
  const fileCount = getWorkFileCount(work);
  const folder = getWorkFolder(work);

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/60">{label}</p>
      <p className="text-lg font-medium">{title}</p>
      {authors && <p className="text-sm text-muted-foreground">{authors}</p>}
      {narrators && (
        <p className="text-sm text-muted-foreground">
          <span className="text-muted-foreground/60">Narrated by </span>
          {narrators}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {formats.map((f) => (
          <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
        ))}
        {fileCount > 0 && (
          <span className="text-xs text-muted-foreground/60">
            {String(fileCount)} {fileCount === 1 ? "file" : "files"}
          </span>
        )}
      </div>
      {folder && (
        <p className="mt-0.5 break-all text-xs text-muted-foreground/60">{folder}</p>
      )}
    </div>
  );
}

function MatchSuggestionCard({
  link,
  onAccept,
  onDecline,
}: {
  link: MatchSuggestionRow;
  onAccept: (id: string, survivingWorkId: string) => void;
  onDecline: (id: string) => void;
}) {
  const isPending = link.reviewStatus === "PENDING";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{link.matchType}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatConfidence(link.confidence)}
          </span>
        </div>
        <Badge variant={statusVariant[link.reviewStatus] ?? "outline"}>
          {link.reviewStatus}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <WorkPanel work={link.targetWork} label="Work A" />
          <WorkPanel work={link.suggestedWork} label="Work B" />
        </div>
        {isPending && (
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => { onAccept(link.id, link.targetWorkId); }}>
              Keep Left
            </Button>
            <Button size="sm" onClick={() => { onAccept(link.id, link.suggestedWorkId); }}>
              Keep Right
            </Button>
            <Button variant="outline" size="sm" onClick={() => { onDecline(link.id); }}>
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MatchSuggestionsPage() {
  const { matchSuggestions } = Route.useLoaderData();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTab>("ALL");
  const [sort, setSort] = useState<SortOption>("title-asc");
  const [view, setView] = useState<ViewMode>("card");
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const filtered = sortLinks(
    activeTab === "ALL"
      ? matchSuggestions
      : matchSuggestions.filter((l) => l.reviewStatus === activeTab),
    sort,
  );

  async function handleRematch() {
    const result = await runMutation(() => rematchAllServerFn(), {
      success: "Match scanning started",
    });
    if (result) {
      const { enqueuedCount } = result as { enqueuedCount: number };
      if (enqueuedCount === 0) {
        toast.success("No files to match");
        return;
      }
    }

    // Poll for new results while background jobs run
    setIsPolling(true);
    pollIntervalRef.current = setInterval(() => {
      void router.invalidate();
    }, 3000);
    // Stop polling after 60 seconds
    setTimeout(() => {
      const intervalId = pollIntervalRef.current as ReturnType<typeof setInterval>;
      clearInterval(intervalId);
      pollIntervalRef.current = null;
      setIsPolling(false);
    }, 60000);
  }

  async function handleAccept(id: string, survivingWorkId: string) {
    await runMutation(() => acceptMatchSuggestionServerFn({ data: { id, survivingWorkId } }), {
      success: "Works merged",
    });
    void router.invalidate();
  }

  async function handleDecline(id: string) {
    await runMutation(() => declineMatchSuggestionServerFn({ data: { id } }), {
      success: "Match suggestion declined",
    });
    void router.invalidate();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Match Suggestions</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Review and resolve suggested edition matches.
        {" "}<span className="text-muted-foreground/60">{String(filtered.length)} {activeTab === "ALL" ? "total" : activeTab.toLowerCase()}</span>
      </p>

      <div className="flex items-center justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(v) => { setActiveTab(v as StatusTab); }}
        >
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPolling}
            onClick={() => { void handleRematch(); }}
          >
            {isPolling ? "Scanning…" : "Re-scan Matches"}
          </Button>
          {view === "card" && (
            <Select value={sort} onValueChange={(v) => { setSort(v as SortOption); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center rounded-md border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setView("card"); }}
              aria-label="Card view"
              data-active={view === "card"}
              className="rounded-r-none data-[active=true]:bg-muted"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setView("table"); }}
              aria-label="Table view"
              data-active={view === "table"}
              className="rounded-l-none data-[active=true]:bg-muted"
            >
              <Table2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No match suggestions found
          </p>
        ) : view === "card" ? (
          <div className="flex flex-col gap-4">
            {filtered.map((link) => (
              <MatchSuggestionCard
                key={link.id}
                link={link}
                onAccept={(id, survivingWorkId) => { void handleAccept(id, survivingWorkId); }}
                onDecline={(id) => { void handleDecline(id); }}
              />
            ))}
          </div>
        ) : (
          <VirtualizedDataTable
            columns={createColumns(
              (id, survivingWorkId) => { void handleAccept(id, survivingWorkId); },
              (id) => { void handleDecline(id); },
            )}
            data={filtered}
            showPagination={false}
          />
        )}
      </div>
    </div>
  );
}
