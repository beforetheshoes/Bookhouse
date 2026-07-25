import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const uploadStatusSchema = z.object({
  importJobId: z.string().min(1),
});

export type UploadStatusResult =
  | {
      status: "QUEUED" | "RUNNING";
      processedFiles: number;
      totalFiles: number;
      errorCount: number;
    }
  | {
      status: "SUCCEEDED";
      processedFiles: number;
      totalFiles: number;
      errorCount: number;
    }
  | {
      status: "FAILED";
      error: string | null;
      processedFiles: number;
      totalFiles: number;
      errorCount: number;
    }
  | null;

export const getUploadStatusServerFn = createServerFn({
  method: "GET",
})
  .validator(uploadStatusSchema)
  .handler(async ({ data }): Promise<UploadStatusResult> => {
    await (await import("./_guards")).authenticatedOnly();
    const { db } = await import("@bookhouse/db");
    const job = await db.importJob.findUnique({
      where: { id: data.importJobId },
      select: {
        id: true,
        kind: true,
        status: true,
        processedFiles: true,
        totalFiles: true,
        errorCount: true,
        error: true,
      },
    });

    if (!job || job.kind !== "UPLOAD_INGEST") {
      return null;
    }

    const { processedFiles, totalFiles, errorCount } = job;

    if (job.status === "FAILED") {
      return {
        status: "FAILED",
        error: job.error,
        processedFiles,
        totalFiles,
        errorCount,
      };
    }

    if (job.status === "SUCCEEDED") {
      return {
        status: "SUCCEEDED",
        processedFiles,
        totalFiles,
        errorCount,
      };
    }

    return {
      status: job.status,
      processedFiles,
      totalFiles,
      errorCount,
    };
  });
