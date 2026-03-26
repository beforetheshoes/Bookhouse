import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getMatchSuggestionsServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const links = await db.matchSuggestion.findMany({
    include: {
      targetWork: {
        include: {
          editions: {
            include: {
              contributors: { include: { contributor: true } },
              editionFiles: {
                include: {
                  fileAsset: {
                    select: { absolutePath: true, mediaKind: true },
                  },
                },
              },
            },
          },
        },
      },
      suggestedWork: {
        include: {
          editions: {
            include: {
              contributors: { include: { contributor: true } },
              editionFiles: {
                include: {
                  fileAsset: {
                    select: { absolutePath: true, mediaKind: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { confidence: "desc" },
  });

  // Filter out suggestions where the suggested work has no actual audio files
  // (e.g., sidecar-only editions from the duplicate edition bug)
  return links.filter((link) =>
    link.suggestedWork.editions.some((ed) =>
      ed.editionFiles.some((ef) => ef.fileAsset.mediaKind === "AUDIO"),
    ),
  );
});

export type MatchSuggestionRow = Awaited<
  ReturnType<typeof getMatchSuggestionsServerFn>
>[number];

const idSchema = z.object({ id: z.string() });
const acceptSchema = z.object({ id: z.string(), survivingWorkId: z.string() });

export const acceptMatchSuggestionServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(acceptSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const link = await db.matchSuggestion.findUniqueOrThrow({
      where: { id: data.id },
      select: { targetWorkId: true, suggestedWorkId: true },
    });

    // User chooses which Work to keep — the other Work's editions get merged in
    const survivingWorkId = data.survivingWorkId;
    const losingWorkId = survivingWorkId === link.targetWorkId
      ? link.suggestedWorkId
      : link.targetWorkId;

    const [survivingWork, losingWork] = await Promise.all([
      db.work.findUniqueOrThrow({ where: { id: survivingWorkId } }),
      db.work.findUniqueOrThrow({ where: { id: losingWorkId } }),
    ]);

    // Reconcile metadata: fill nulls on surviving work from losing work
    const reconcileFields = [
      "description",
      "coverPath",
      "seriesId",
      "seriesPosition",
      "sortTitle",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of reconcileFields) {
      if (
        survivingWork[field as keyof typeof survivingWork] == null &&
        losingWork[field as keyof typeof losingWork] != null
      ) {
        updates[field] = losingWork[field as keyof typeof losingWork];
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.work.update({
        where: { id: survivingWorkId },
        data: updates,
      });
    }

    // Move editions from losing work to surviving work
    await db.edition.updateMany({
      where: { workId: losingWorkId },
      data: { workId: survivingWorkId },
    });

    // Delete the losing work (cascades MatchSuggestion deletion)
    await db.work.delete({ where: { id: losingWorkId } });

    return { success: true };
  });

export const declineMatchSuggestionServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    await db.matchSuggestion.update({
      where: { id: data.id },
      data: { reviewStatus: "IGNORED" },
    });
    return { success: true };
  });

export const rematchAllServerFn = createServerFn({
  method: "POST",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const { enqueueLibraryJob, LIBRARY_JOB_NAMES } = await import(
    "@bookhouse/shared"
  );

  const audioFiles = await db.editionFile.findMany({
    where: {
      edition: { formatFamily: "AUDIOBOOK" },
      fileAsset: { mediaKind: "AUDIO" },
    },
    select: { fileAssetId: true },
    distinct: ["fileAssetId"],
  });

  const importJob = await db.importJob.create({
    data: {
      kind: "MATCH_SUGGESTIONS",
      status: "QUEUED",
      totalFiles: audioFiles.length,
    },
  });

  for (const { fileAssetId } of audioFiles) {
    await enqueueLibraryJob(LIBRARY_JOB_NAMES.MATCH_SUGGESTIONS, {
      fileAssetId,
      importJobId: importJob.id,
    });
  }

  return { importJobId: importJob.id, enqueuedCount: audioFiles.length };
});
