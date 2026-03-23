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

function getFirstEditionFileAsset(row: DuplicateRow, side: "left" | "right") {
  const edition = side === "left" ? row.leftEdition : row.rightEdition;
  const editionFiles = edition?.editionFiles;
  const editionFile = editionFiles?.[0];
  return editionFile?.fileAsset ?? null;
}

function getFilePath(row: DuplicateRow, side: "left" | "right"): string | null {
  const file = side === "left" ? row.leftFileAsset : row.rightFileAsset;
  if (file?.relativePath) return file.relativePath;
  return getFirstEditionFileAsset(row, side)?.relativePath ?? null;
}

function getFileSize(row: DuplicateRow, side: "left" | "right"): bigint | null {
  const file = side === "left" ? row.leftFileAsset : row.rightFileAsset;
  if (file?.sizeBytes != null) return file.sizeBytes;
  return getFirstEditionFileAsset(row, side)?.sizeBytes ?? null;
}

function getMediaKind(row: DuplicateRow, side: "left" | "right"): string | null {
  const file = side === "left" ? row.leftFileAsset : row.rightFileAsset;
  if (file?.mediaKind) return file.mediaKind;
  return getFirstEditionFileAsset(row, side)?.mediaKind ?? null;
}

function getMatchingId(row: DuplicateRow, side: "left" | "right"): string | null {
  if (row.reason === "SAME_ISBN") {
    const edition = side === "left" ? row.leftEdition : row.rightEdition;
    if (edition?.isbn13) return edition.isbn13;
    if (edition?.isbn10) return edition.isbn10;
  }
  if (row.reason === "SAME_HASH") {
    const file = side === "left" ? row.leftFileAsset : row.rightFileAsset;
    if (file?.fullHash) return file.fullHash.slice(0, 12);
  }
  return null;
}

function getCoverUrl(row: DuplicateRow, side: "left" | "right"): string | null {
  const edition = side === "left" ? row.leftEdition : row.rightEdition;
  if (!edition?.work.coverPath) return null;
  return `/api/covers/${edition.work.id}/thumb`;
}

function getPublisher(row: DuplicateRow, side: "left" | "right"): string | null {
  const edition = side === "left" ? row.leftEdition : row.rightEdition;
  return edition?.publisher ?? null;
}

function getPublishedAt(row: DuplicateRow, side: "left" | "right"): string | null {
  const edition = side === "left" ? row.leftEdition : row.rightEdition;
  if (!edition?.publishedAt) return null;
  return new Date(edition.publishedAt).getFullYear().toString();
}

export function formatFileSize(bytes: bigint | null): string {
  if (bytes == null) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
          <SidePanel
            label={getItemLabel(dup, "left")}
            authors={getAuthors(dup, "left")}
            filePath={getFilePath(dup, "left")}
            fileSize={getFileSize(dup, "left")}
            mediaKind={getMediaKind(dup, "left")}
            matchingId={getMatchingId(dup, "left")}
            coverUrl={getCoverUrl(dup, "left")}
            publisher={getPublisher(dup, "left")}
            publishedAt={getPublishedAt(dup, "left")}
          />
          <SidePanel
            label={getItemLabel(dup, "right")}
            authors={getAuthors(dup, "right")}
            filePath={getFilePath(dup, "right")}
            fileSize={getFileSize(dup, "right")}
            mediaKind={getMediaKind(dup, "right")}
            matchingId={getMatchingId(dup, "right")}
            coverUrl={getCoverUrl(dup, "right")}
            publisher={getPublisher(dup, "right")}
            publishedAt={getPublishedAt(dup, "right")}
          />
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

function SidePanel({
  label,
  authors,
  filePath,
  fileSize,
  mediaKind,
  matchingId,
  coverUrl,
  publisher,
  publishedAt,
}: {
  label: string;
  authors: string;
  filePath: string | null;
  fileSize: bigint | null;
  mediaKind: string | null;
  matchingId: string | null;
  coverUrl: string | null;
  publisher: string | null;
  publishedAt: string | null;
}) {
  return (
    <div className="flex gap-3">
      {coverUrl && (
        <img
          src={coverUrl}
          alt="Cover"
          className="h-20 w-14 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        {authors && <p className="text-sm text-muted-foreground">{authors}</p>}
        {filePath && (
          <p className="truncate text-xs text-muted-foreground">{filePath}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {mediaKind && <Badge variant="outline" className="text-xs">{mediaKind}</Badge>}
          {fileSize != null && (
            <span className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</span>
          )}
        </div>
        {matchingId && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">{matchingId}</p>
        )}
        {(publisher || publishedAt) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {[publisher, publishedAt].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
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
