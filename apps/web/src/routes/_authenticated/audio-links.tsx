import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
        return a.ebookEdition.work.titleDisplay.localeCompare(b.ebookEdition.work.titleDisplay);
      case "title-desc":
        return b.ebookEdition.work.titleDisplay.localeCompare(a.ebookEdition.work.titleDisplay);
      case "author-asc": {
        const authA = getContributorsByRole(a.ebookEdition, "AUTHOR") || "\uffff";
        const authB = getContributorsByRole(b.ebookEdition, "AUTHOR") || "\uffff";
        return authA.localeCompare(authB);
      }
      case "author-desc": {
        const authA = getContributorsByRole(a.ebookEdition, "AUTHOR") || "";
        const authB = getContributorsByRole(b.ebookEdition, "AUTHOR") || "";
        return authB.localeCompare(authA);
      }
      case "date-desc":
        return new Date(b.ebookEdition.work.createdAt).getTime() - new Date(a.ebookEdition.work.createdAt).getTime();
      case "date-asc":
        return new Date(a.ebookEdition.work.createdAt).getTime() - new Date(b.ebookEdition.work.createdAt).getTime();
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

type Edition = AudioLinkRow["ebookEdition"];

function getContributorsByRole(edition: Edition, role: string): string {
  return edition.contributors
    .filter((c) => c.role === role)
    .map((c) => c.contributor.nameDisplay)
    .join(", ");
}

function getAudiobookFolder(edition: Edition): string | null {
  const anyFile = edition.editionFiles[0];
  if (!anyFile) return null;
  const parts = anyFile.fileAsset.absolutePath.split("/");
  parts.pop();
  return parts.join("/");
}

function getAudioTrackCount(edition: Edition): number {
  return edition.editionFiles.filter(
    (ef) => ef.fileAsset.mediaKind === "AUDIO",
  ).length;
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

  const workTitle = link.ebookEdition.work.titleDisplay;
  const workAuthors = getContributorsByRole(link.ebookEdition, "AUTHOR");

  const audioTitle = link.audioEdition.work.titleDisplay;
  const audioAuthors = getContributorsByRole(link.audioEdition, "AUTHOR");
  const audioNarrators = getContributorsByRole(link.audioEdition, "NARRATOR");
  const audioFolder = getAudiobookFolder(link.audioEdition);
  const trackCount = getAudioTrackCount(link.audioEdition);

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

  const filtered = sortLinks(
    activeTab === "ALL"
      ? audioLinks
      : audioLinks.filter((l) => l.reviewStatus === activeTab),
    sort,
  );

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
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No audio links found
          </p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
