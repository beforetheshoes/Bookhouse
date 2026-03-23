import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAudioLinksServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const links = await db.audioLink.findMany({
    include: {
      ebookWork: {
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
      audioWork: {
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

  // Filter out links where the audio work has no actual audio files
  // (e.g., sidecar-only editions from the duplicate edition bug)
  return links.filter((link) =>
    link.audioWork.editions.some((ed) =>
      ed.editionFiles.some((ef) => ef.fileAsset.mediaKind === "AUDIO"),
    ),
  );
});

export type AudioLinkRow = Awaited<
  ReturnType<typeof getAudioLinksServerFn>
>[number];

const idSchema = z.object({ id: z.string() });

export const confirmAudioLinkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const link = await db.audioLink.findUniqueOrThrow({
      where: { id: data.id },
      select: { ebookWorkId: true, audioWorkId: true },
    });

    const [ebookWork, audioWork] = await Promise.all([
      db.work.findUniqueOrThrow({ where: { id: link.ebookWorkId } }),
      db.work.findUniqueOrThrow({ where: { id: link.audioWorkId } }),
    ]);

    // Reconcile metadata: fill nulls on ebook work from audio work
    const reconcileFields = [
      "description",
      "language",
      "coverPath",
      "seriesId",
      "seriesPosition",
      "sortTitle",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of reconcileFields) {
      if (
        ebookWork[field as keyof typeof ebookWork] == null &&
        audioWork[field as keyof typeof audioWork] != null
      ) {
        updates[field] = audioWork[field as keyof typeof audioWork];
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.work.update({
        where: { id: link.ebookWorkId },
        data: updates,
      });
    }

    // Move editions from audio work to ebook work
    await db.edition.updateMany({
      where: { workId: link.audioWorkId },
      data: { workId: link.ebookWorkId },
    });

    // Delete the losing work (cascades AudioLink deletion)
    await db.work.delete({ where: { id: link.audioWorkId } });

    return { success: true };
  });

export const ignoreAudioLinkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    await db.audioLink.update({
      where: { id: data.id },
      data: { reviewStatus: "IGNORED" },
    });
    return { success: true };
  });

export const rematchAllAudioServerFn = createServerFn({
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
      kind: "MATCH_AUDIO",
      status: "QUEUED",
      totalFiles: audioFiles.length,
    },
  });

  for (const { fileAssetId } of audioFiles) {
    await enqueueLibraryJob(LIBRARY_JOB_NAMES.MATCH_AUDIO, {
      fileAssetId,
      importJobId: importJob.id,
    });
  }

  return { importJobId: importJob.id, enqueuedCount: audioFiles.length };
});
