import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const triggerSchema = z.object({
  workId: z.string(),
});

export const triggerEnrichmentServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(triggerSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { enqueueLibraryJob } = await import("@bookhouse/shared");

    const importJob = await db.importJob.create({
      data: {
        kind: "REFRESH_METADATA",
        status: "QUEUED",
        payload: { workId: data.workId },
      },
    });

    const queueJobId = await enqueueLibraryJob("refresh-metadata", {
      workId: data.workId,
      importJobId: importJob.id,
    });

    return { importJobId: importJob.id, queueJobId };
  });

const getSchema = z.object({
  workId: z.string(),
});

export const getEnrichmentDataServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const work = await db.work.findUnique({
      where: { id: data.workId },
      include: {
        editions: {
          include: { externalLinks: true },
        },
      },
    });

    if (!work) return { externalLinks: [] };

    const externalLinks = work.editions.flatMap((e) => e.externalLinks);
    return { externalLinks };
  });

const applySchema = z.object({
  workId: z.string(),
  fields: z.record(z.unknown()),
});

export const applyEnrichmentServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(applySchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    // Read which fields were manually edited — skip those
    const work = await db.work.findUnique({
      where: { id: data.workId },
      select: { editedFields: true },
    });

    const editedFields = work?.editedFields ?? [];
    const filteredFields = Object.fromEntries(
      Object.entries(data.fields).filter(([key]) => !editedFields.includes(key)),
    );

    if (Object.keys(filteredFields).length === 0) {
      return { success: true, skippedAll: true };
    }

    await db.work.update({
      where: { id: data.workId },
      data: filteredFields,
    });

    return { success: true };
  });
