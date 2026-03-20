import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
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

function formatConfidence(val: number | null): string {
  if (val == null) return "—";
  return `${String(Math.round(val * 100))}%`;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  IGNORED: "secondary",
  CONFIRMED: "default",
};

function getAuthors(edition: AudioLinkRow["ebookEdition"]): string {
  if (edition.contributors.length === 0) return "";
  return edition.contributors.map((c) => c.contributor.nameDisplay).join(", ");
}

function SidePanel({ label, authors }: { label: string; authors: string }) {
  return (
    <div>
      <p className="font-medium">{label}</p>
      {authors && <p className="text-sm text-muted-foreground">{authors}</p>}
    </div>
  );
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
        <div className="grid grid-cols-2 gap-4">
          <SidePanel
            label={link.ebookEdition.work.titleDisplay}
            authors={getAuthors(link.ebookEdition)}
          />
          <SidePanel
            label={link.audioEdition.work.titleDisplay}
            authors={getAuthors(link.audioEdition)}
          />
        </div>
        {isPending && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { onConfirm(link.id); }}>
              Confirm
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

  const filtered =
    activeTab === "ALL"
      ? audioLinks
      : audioLinks.filter((l) => l.reviewStatus === activeTab);

  async function handleConfirm(id: string) {
    await runMutation(() => confirmAudioLinkServerFn({ data: { id } }), {
      success: "Audio link confirmed",
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
        Review ebook-to-audiobook matches.
      </p>

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
