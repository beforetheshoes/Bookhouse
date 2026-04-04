import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const bulkEnrichSchema = z.object({
  workIds: z.array(z.string()).min(1),
  sources: z.array(z.enum(["openlibrary", "googlebooks", "hardcover"])).min(1),
  strategy: z.enum(["fullest", "priority"]),
});

export const bulkEnrichServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(bulkEnrichSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { enqueueEnrichmentJob } = await import("@bookhouse/shared");

    const importJob = await db.importJob.create({
      data: {
        kind: "BULK_ENRICH",
        status: "QUEUED",
        totalFiles: data.workIds.length,
        processedFiles: 0,
        errorCount: 0,
        payload: { sources: data.sources, strategy: data.strategy },
      },
    });

    for (const workId of data.workIds) {
      await enqueueEnrichmentJob("bulk-enrich-metadata", {
        workId,
        sources: data.sources,
        strategy: data.strategy,
        importJobId: importJob.id,
      });
    }

    return { importJobId: importJob.id, enqueuedCount: data.workIds.length };
  });
