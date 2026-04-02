import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { IGNORED_BASENAMES } from "@bookhouse/ingest";

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
  ] = await Promise.all([
    db.work.count(),
    db.work.count({ where: { coverPath: null } }),
    db.work.count({
      where: {
        editions: {
          every: { isbn13: null, isbn10: null },
        },
      },
    }),
    db.duplicateCandidate.count({ where: { status: "PENDING" } }),
    db.fileAsset.count({
      where: {
        editionFiles: { none: {} },
        availabilityStatus: "PRESENT",
        mediaKind: { notIn: ["COVER", "SIDECAR"] },
        basename: { notIn: Array.from(IGNORED_BASENAMES) },
      },
    }),
    db.matchSuggestion.count({ where: { reviewStatus: "PENDING" } }),
    db.work.count({
      where: {
        enrichmentStatus: "ENRICHED",
        externalLinks: {
          some: {},
          every: { lastSyncedAt: { lt: sixMonthsAgo } },
        },
      },
    }),
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
      basename: { notIn: Array.from(IGNORED_BASENAMES) },
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

