import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IGNORED_LIBRARY_FILE_BASENAMES = [".DS_Store", "Thumbs.db", "desktop.ini"] as const;

const KEPUB_EXCLUDED_MEDIA_KINDS = ["KEPUB", "COVER", "SIDECAR"] as const;

const hasFilesWhere = {
  editions: {
    some: {
      editionFiles: {
        some: {
          fileAsset: {
            availabilityStatus: "PRESENT" as const,
            mediaKind: { notIn: [...KEPUB_EXCLUDED_MEDIA_KINDS] },
          },
        },
      },
    },
  },
};

export const getLibraryHealthServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [
    totalWorks,
    missingCoverCount,
    noIsbnCount,
    pendingDuplicatesCount,
    orphanedFilesCount,
    pendingMatchSuggestionsCount,
    staleEnrichmentCount,
    emptyWorksCount,
  ] = await Promise.all([
    db.work.count({ where: hasFilesWhere }),
    db.work.count({ where: { AND: [hasFilesWhere, { coverPath: null }] } }),
    db.work.count({
      where: {
        AND: [
          hasFilesWhere,
          { editions: { every: { isbn13: null, isbn10: null } } },
        ],
      },
    }),
    db.duplicateCandidate.count({ where: { status: "PENDING" } }),
    db.fileAsset.count({
      where: {
        editionFiles: { none: {} },
        availabilityStatus: "PRESENT",
        mediaKind: { notIn: ["COVER", "SIDECAR"] },
        basename: { notIn: [...IGNORED_LIBRARY_FILE_BASENAMES] },
      },
    }),
    db.matchSuggestion.count({ where: { reviewStatus: "PENDING" } }),
    db.work.count({
      where: {
        AND: [
          hasFilesWhere,
          {
            enrichmentStatus: "ENRICHED",
            externalLinks: {
              some: {},
              every: { lastSyncedAt: { lt: sixMonthsAgo } },
            },
          },
        ],
      },
    }),
    db.work.count({ where: { NOT: hasFilesWhere } }),
  ]);

  return {
    totalWorks,
    checks: {
      missingCover: { count: missingCoverCount, total: totalWorks },
      noIsbn: { count: noIsbnCount, total: totalWorks },
      pendingDuplicates: { count: pendingDuplicatesCount },
      orphanedFiles: { count: orphanedFilesCount },
      pendingMatchSuggestions: { count: pendingMatchSuggestionsCount },
      staleEnrichment: { count: staleEnrichmentCount, total: totalWorks },
      emptyWorks: { count: emptyWorksCount },
    },
  };
});

export type LibraryHealthData = Awaited<
  ReturnType<typeof getLibraryHealthServerFn>
>;

// ─── Orphaned Files ───────────────────────────────────────────────────────────

export const getOrphanedFilesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.fileAsset.findMany({
    where: {
      editionFiles: { none: {} },
      availabilityStatus: "PRESENT",
      mediaKind: { notIn: ["COVER", "SIDECAR"] },
      basename: { notIn: [...IGNORED_LIBRARY_FILE_BASENAMES] },
    },
    select: {
      id: true,
      relativePath: true,
      mediaKind: true,
      sizeBytes: true,
    },
    orderBy: { relativePath: "asc" },
  });
});

export type OrphanedFile = Awaited<
  ReturnType<typeof getOrphanedFilesServerFn>
>[number];

export const deleteOrphanedFileServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ fileAssetId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const fileAsset = await db.fileAsset.findUnique({
      where: { id: data.fileAssetId },
      include: { editionFiles: { take: 1 } },
    });
    if (!fileAsset) throw new Error("File not found");
    if (fileAsset.editionFiles.length > 0) throw new Error("File has linked editions");
    await db.fileAsset.delete({ where: { id: data.fileAssetId } });
    return { success: true };
  });

// ─── Empty Works ──────────────────────────────────────────────────────────────

export const getEmptyWorksServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.work.findMany({
    where: { NOT: hasFilesWhere },
    select: { id: true, titleDisplay: true },
    orderBy: { titleDisplay: "asc" },
  });
});

export type EmptyWork = Awaited<
  ReturnType<typeof getEmptyWorksServerFn>
>[number];

export const deleteEmptyWorksServerFn = createServerFn({
  method: "POST",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const emptyWorks = await db.work.findMany({
    where: { NOT: hasFilesWhere },
    select: { id: true },
  });
  if (emptyWorks.length === 0) {
    return { deletedCount: 0 };
  }
  await db.work.deleteMany({
    where: { id: { in: emptyWorks.map((w: { id: string }) => w.id) } },
  });
  return { deletedCount: emptyWorks.length };
});
