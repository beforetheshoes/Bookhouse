import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TablePageSkeleton } from "~/components/skeletons/table-page-skeleton";
import { runMutation } from "~/lib/mutation";
import {
  getDuplicatesServerFn,
  ignoreDuplicateServerFn,
  confirmDuplicateServerFn,
  mergeDuplicateServerFn,
  type DuplicateRow,
} from "~/lib/server-fns/duplicates";

export const Route = createFileRoute("/_authenticated/duplicates")({
  loader: async () => {
    const duplicates = await getDuplicatesServerFn({ data: {} });
    return { duplicates };
  },
  pendingComponent: TablePageSkeleton,
  component: DuplicatesPage,
});

type StatusTab = "ALL" | "PENDING" | "CONFIRMED" | "IGNORED" | "MERGED";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IGNORED", label: "Ignored" },
  { value: "MERGED", label: "Merged" },
];

function getItemLabel(row: DuplicateRow, side: "left" | "right"): string {
  const edition = side === "left" ? row.leftEdition : row.rightEdition;
  const file = side === "left" ? row.leftFileAsset : row.rightFileAsset;
  if (edition) return edition.work.titleDisplay;
  if (file) return file.basename;
  return "—";
}

function getAuthors(row: DuplicateRow, side: "left" | "right"): string {
  const edition = side === "left" ? row.leftEdition : row.rightEdition;
  if (!edition?.contributors || edition.contributors.length === 0) return "";
  return edition.contributors.map((c) => c.contributor.nameDisplay).join(", ");
}

function formatConfidence(val: number | null): string {
  if (val == null) return "—";
  return `${String(Math.round(val * 100))}%`;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  IGNORED: "secondary",
  CONFIRMED: "default",
  MERGED: "default",
};

function DuplicateCard({
  dup,
  onIgnore,
  onConfirm,
  onMerge,
}: {
  dup: DuplicateRow;
  onIgnore: (id: string) => void;
  onConfirm: (id: string) => void;
  onMerge: (id: string, survivingEditionId: string) => void;
}) {
  const isPending = dup.status === "PENDING";
  const canMerge = (isPending || dup.status === "CONFIRMED") && dup.leftEditionId && dup.rightEditionId;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{dup.reason}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatConfidence(dup.confidence)}
          </span>
        </div>
        <Badge variant={statusVariant[dup.status] ?? "outline"}>
          {dup.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <SidePanel label={getItemLabel(dup, "left")} authors={getAuthors(dup, "left")} />
          <SidePanel label={getItemLabel(dup, "right")} authors={getAuthors(dup, "right")} />
        </div>
        <div className="mt-4 flex gap-2">
          {isPending && (
            <>
              <Button variant="outline" size="sm" onClick={() => { onIgnore(dup.id); }}>
                Ignore
              </Button>
              <Button variant="outline" size="sm" onClick={() => { onConfirm(dup.id); }}>
                Confirm
              </Button>
            </>
          )}
          {canMerge && (
            <>
              <Button size="sm" onClick={() => { onMerge(dup.id, dup.leftEditionId as string); }}>
                Keep Left
              </Button>
              <Button size="sm" onClick={() => { onMerge(dup.id, dup.rightEditionId as string); }}>
                Keep Right
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SidePanel({ label, authors }: { label: string; authors: string }) {
  return (
    <div>
      <p className="font-medium">{label}</p>
      {authors && <p className="text-sm text-muted-foreground">{authors}</p>}
    </div>
  );
}

function DuplicatesPage() {
  const { duplicates } = Route.useLoaderData();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTab>("ALL");

  const filtered =
    activeTab === "ALL"
      ? duplicates
      : duplicates.filter((d) => d.status === activeTab);

  async function handleIgnore(id: string) {
    await runMutation(() => ignoreDuplicateServerFn({ data: { id } }), {
      success: "Duplicate ignored",
    });
    void router.invalidate();
  }

  async function handleConfirm(id: string) {
    await runMutation(() => confirmDuplicateServerFn({ data: { id } }), {
      success: "Duplicate confirmed",
    });
    void router.invalidate();
  }

  async function handleMerge(id: string, survivingEditionId: string) {
    await runMutation(
      () => mergeDuplicateServerFn({ data: { id, survivingEditionId } }),
      { success: "Editions merged" },
    );
    void router.invalidate();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Duplicates</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Review and resolve duplicate candidates.
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
            No duplicates found
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((dup) => (
              <DuplicateCard
                key={dup.id}
                dup={dup}
                onIgnore={(id) => { void handleIgnore(id); }}
                onConfirm={(id) => { void handleConfirm(id); }}
                onMerge={(id, survivingEditionId) => { void handleMerge(id, survivingEditionId); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
