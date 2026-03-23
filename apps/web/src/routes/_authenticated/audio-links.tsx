import { useState } from "react";
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
  getAudioLinksServerFn,
  confirmAudioLinkServerFn,
  ignoreAudioLinkServerFn,
  rematchAllAudioServerFn,
  type AudioLinkRow,
} from "~/lib/server-fns/audio-links";

export const Route = createFileRoute("/_authenticated/audio-links")({
  loader: async () => {
    const audioLinks = await getAudioLinksServerFn();
    return { audioLinks };
  },
  pendingComponent: TablePageSkeleton,
  component: AudioLinksPage,
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

function sortLinks(links: AudioLinkRow[], sort: SortOption): AudioLinkRow[] {
  const sorted = [...links];
  sorted.sort((a: AudioLinkRow, b: AudioLinkRow) => {
    switch (sort) {
      case "title-asc":
        return a.ebookWork.titleDisplay.localeCompare(b.ebookWork.titleDisplay);
      case "title-desc":
        return b.ebookWork.titleDisplay.localeCompare(a.ebookWork.titleDisplay);
      case "author-asc": {
        const authA = getContributorsByRole(a.ebookWork.editions, "AUTHOR") || "\uffff";
        const authB = getContributorsByRole(b.ebookWork.editions, "AUTHOR") || "\uffff";
        return authA.localeCompare(authB);
      }
      case "author-desc": {
        const authA = getContributorsByRole(a.ebookWork.editions, "AUTHOR") || "";
        const authB = getContributorsByRole(b.ebookWork.editions, "AUTHOR") || "";
        return authB.localeCompare(authA);
      }
      case "date-desc":
        return new Date(b.ebookWork.createdAt).getTime() - new Date(a.ebookWork.createdAt).getTime();
      case "date-asc":
        return new Date(a.ebookWork.createdAt).getTime() - new Date(b.ebookWork.createdAt).getTime();
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

type EditionWithContributors = AudioLinkRow["ebookWork"]["editions"][number];

function getContributorsByRole(editions: EditionWithContributors[], role: string): string {
  return editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === role)
    .map((c) => c.contributor.nameDisplay)
    .join(", ");
}

function getAudiobookFolder(work: AudioLinkRow["audioWork"]): string | null {
  const allFiles = work.editions.flatMap((e) => e.editionFiles);
  const anyFile = allFiles[0];
  if (!anyFile) return null;
  const parts = anyFile.fileAsset.absolutePath.split("/");
  parts.pop();
  return parts.join("/");
}

function getAudioTrackCount(work: AudioLinkRow["audioWork"]): number {
  return work.editions
    .flatMap((e) => e.editionFiles)
    .filter((ef) => ef.fileAsset.mediaKind === "AUDIO").length;
}

type ViewMode = "card" | "table";

function createColumns(
  onConfirm: (id: string) => void,
  onIgnore: (id: string) => void,
): ColumnDef<AudioLinkRow>[] {
  return [
    {
      id: "ebookTitle",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ebook" />
      ),
      accessorFn: (row) => row.ebookWork.titleDisplay,
      size: 250,
    },
    {
      id: "audioTitle",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Audiobook" />
      ),
      accessorFn: (row) => row.audioWork.titleDisplay,
      size: 250,
    },
    {
      id: "author",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Author" />
      ),
      accessorFn: (row) => getContributorsByRole(row.ebookWork.editions, "AUTHOR") || "—",
      size: 180,
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
            <Button variant="outline" size="sm" onClick={() => { onConfirm(row.original.id); }}>
              Merge
            </Button>
            <Button variant="outline" size="sm" onClick={() => { onIgnore(row.original.id); }}>
              Ignore
            </Button>
          </div>
        );
      },
      size: 150,
    },
  ];
}

function AudioLinkCard({
  link,
  onConfirm,
  onIgnore,
}: {
  link: AudioLinkRow;
  onConfirm: (id: string) => void;
  onIgnore: (id: string) => void;
}) {
  const isPending = link.reviewStatus === "PENDING";

  const workTitle = link.ebookWork.titleDisplay;
  const workAuthors = getContributorsByRole(link.ebookWork.editions, "AUTHOR");

  const audioTitle = link.audioWork.titleDisplay;
  const audioAuthors = getContributorsByRole(link.audioWork.editions, "AUTHOR");
  const audioNarrators = getContributorsByRole(link.audioWork.editions, "NARRATOR");
  const audioFolder = getAudiobookFolder(link.audioWork);
  const trackCount = getAudioTrackCount(link.audioWork);

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
          <div>
            <p className="text-lg font-medium">{workTitle}</p>
            {workAuthors && <p className="text-sm text-muted-foreground">{workAuthors}</p>}
          </div>
          <div>
            <p className="text-lg font-medium">{audioTitle}</p>
            {audioAuthors && <p className="text-sm text-muted-foreground">{audioAuthors}</p>}
            {audioNarrators && (
              <p className="text-sm text-muted-foreground">
                <span className="text-muted-foreground/60">Narrated by </span>
                {audioNarrators}
              </p>
            )}
            {trackCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground/60">
                {String(trackCount)} audio {trackCount === 1 ? "file" : "files"}
              </p>
            )}
            {audioFolder && (
              <p className="mt-0.5 break-all text-xs text-muted-foreground/60">{audioFolder}</p>
            )}
          </div>
        </div>
        {isPending && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { onConfirm(link.id); }}>
              Merge
            </Button>
            <Button variant="outline" size="sm" onClick={() => { onIgnore(link.id); }}>
              Ignore
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AudioLinksPage() {
  const { audioLinks } = Route.useLoaderData();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTab>("ALL");
  const [sort, setSort] = useState<SortOption>("title-asc");
  const [view, setView] = useState<ViewMode>("card");

  const filtered = sortLinks(
    activeTab === "ALL"
      ? audioLinks
      : audioLinks.filter((l) => l.reviewStatus === activeTab),
    sort,
  );

  async function handleRematch() {
    const result = await runMutation(() => rematchAllAudioServerFn(), {
      success: "Audio re-matching started",
    });
    if (result) {
      const { enqueuedCount } = result as { enqueuedCount: number };
      if (enqueuedCount === 0) {
        toast.success("No audiobook files to match");
      }
    }
    void router.invalidate();
  }

  async function handleConfirm(id: string) {
    await runMutation(() => confirmAudioLinkServerFn({ data: { id } }), {
      success: "Audiobook merged into work",
    });
    void router.invalidate();
  }

  async function handleIgnore(id: string) {
    await runMutation(() => ignoreAudioLinkServerFn({ data: { id } }), {
      success: "Audio link ignored",
    });
    void router.invalidate();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Audio Links</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Merge audiobooks into existing works.
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
            onClick={() => { void handleRematch(); }}
          >
            Re-match All
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
            No audio links found
          </p>
        ) : view === "card" ? (
          <div className="flex flex-col gap-4">
            {filtered.map((link) => (
              <AudioLinkCard
                key={link.id}
                link={link}
                onConfirm={(id) => { void handleConfirm(id); }}
                onIgnore={(id) => { void handleIgnore(id); }}
              />
            ))}
          </div>
        ) : (
          <VirtualizedDataTable
            columns={createColumns(
              (id) => { void handleConfirm(id); },
              (id) => { void handleIgnore(id); },
            )}
            data={filtered}
            showPagination={false}
          />
        )}
      </div>
    </div>
  );
}
