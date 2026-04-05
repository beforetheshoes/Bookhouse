import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const mergeWorksServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      targetWorkId: z.string().min(1),
      sourceWorkIds: z.array(z.string().min(1)).min(1).max(99),
    }),
  )
  .handler(async ({ data }) => {
    if (data.sourceWorkIds.includes(data.targetWorkId)) {
      throw new Error("Target work cannot be in source works");
    }
    const { mergeWorksById } = await import("@bookhouse/ingest");
    for (const sourceWorkId of data.sourceWorkIds) {
      await mergeWorksById(data.targetWorkId, sourceWorkId);
    }
    return { targetWorkId: data.targetWorkId, mergedWorkIds: data.sourceWorkIds };
  });

export const splitEditionToWorkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ editionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const edition = await db.edition.findUnique({
      where: { id: data.editionId },
      include: { work: true },
    });
    if (!edition) {
      throw new Error("Edition not found");
    }

    const editionCount = await db.edition.count({ where: { workId: edition.workId } });
    if (editionCount < 2) {
      throw new Error("Cannot split the only edition from a work");
    }

    const newWork = await db.work.create({
      data: {
        titleCanonical: edition.work.titleCanonical,
        titleDisplay: edition.work.titleDisplay,
        coverPath: edition.work.coverPath,
        ...(edition.work.coverColors !== null ? { coverColors: edition.work.coverColors } : {}),
        enrichmentStatus: "STUB",
      },
    });

    await db.edition.update({
      where: { id: data.editionId },
      data: { workId: newWork.id },
    });

    return { newWorkId: newWork.id, editionId: data.editionId };
  });

export const splitEditionFilesServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      editionId: z.string().min(1),
      editionFileIds: z.array(z.string().min(1)).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const edition = await db.edition.findUnique({
      where: { id: data.editionId },
      include: { editionFiles: true },
    });
    if (!edition) {
      throw new Error("Edition not found");
    }

    if (edition.editionFiles.length < 2) {
      throw new Error("Edition must have at least 2 files to split");
    }

    if (data.editionFileIds.length >= edition.editionFiles.length) {
      throw new Error("Cannot move all files from an edition");
    }

    const editionFileIdSet = new Set(edition.editionFiles.map((ef: { id: string }) => ef.id));
    const allBelong = data.editionFileIds.every((id) => editionFileIdSet.has(id));
    if (!allBelong) {
      throw new Error("Some file IDs do not belong to this edition");
    }

    const newEdition = await db.edition.create({
      data: { workId: edition.workId, formatFamily: edition.formatFamily },
    });

    await db.editionFile.updateMany({
      where: { id: { in: data.editionFileIds } },
      data: { editionId: newEdition.id },
    });

    return { newEditionId: newEdition.id, movedFileCount: data.editionFileIds.length };
  });
