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
  .validator(acceptSchema)
  .handler(async ({ data }) => {
    await (await import("./_guards")).ownerOnly();
    const { db } = await import("@bookhouse/db");

    const { mergeWorksById } = await import("@bookhouse/ingest");

    const link = await db.matchSuggestion.findUniqueOrThrow({
      where: { id: data.id },
      select: { targetWorkId: true, suggestedWorkId: true },
    });

    // User chooses which Work to keep — the other Work's editions get merged in.
    // A surviving id outside the pair would otherwise re-parent the target's
    // editions onto an arbitrary work and delete the target.
    const survivingWorkId = data.survivingWorkId;
    if (survivingWorkId !== link.targetWorkId && survivingWorkId !== link.suggestedWorkId) {
      throw new Error("Surviving work must be one of the suggestion's works");
    }
    const losingWorkId = survivingWorkId === link.targetWorkId
      ? link.suggestedWorkId
      : link.targetWorkId;

    // Same transactional merge the Merge Works action uses: reconciles
    // metadata, carries tags / external links / progress preferences across,
    // moves the editions and deletes the losing work (which cascades this
    // suggestion).
    await mergeWorksById(survivingWorkId, losingWorkId);

    return { success: true };
  });

export const declineMatchSuggestionServerFn = createServerFn({
  method: "POST",
})
  .validator(idSchema)
  .handler(async ({ data }) => {
    await (await import("./_guards")).ownerOnly();
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
  await (await import("./_guards")).ownerOnly();
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
