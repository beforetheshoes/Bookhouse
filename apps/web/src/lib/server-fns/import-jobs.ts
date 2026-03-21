import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const importJobStatusValues = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const;
const importJobKindValues = [
  "SCAN_ROOT",
  "HASH_FILE",
  "PARSE_FILE",
  "REFRESH_METADATA",
  "DETECT_DUPLICATES",
  "MATCH_AUDIO",
] as const;

const getImportJobsSchema = z.object({
  status: z.array(z.enum(importJobStatusValues)).optional(),
  kind: z.array(z.enum(importJobKindValues)).optional(),
  libraryRootId: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const getImportJobsServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getImportJobsSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const where = {
      ...(data.status && data.status.length > 0
        ? { status: { in: data.status } }
        : {}),
      ...(data.kind && data.kind.length > 0
        ? { kind: { in: data.kind } }
        : {}),
      ...(data.libraryRootId ? { libraryRootId: data.libraryRootId } : {}),
    };

    const [jobs, totalCount] = await Promise.all([
      db.importJob.findMany({
        where,
        select: {
          id: true,
          bullmqJobId: true,
          kind: true,
          status: true,
          error: true,
          attemptsMade: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          libraryRoot: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      db.importJob.count({ where }),
    ]);

    return { jobs, totalCount, page: data.page, pageSize: data.pageSize };
  });

export type ImportJobRow = Awaited<
  ReturnType<typeof getImportJobsServerFn>
>["jobs"][number];

const getImportJobDetailSchema = z.object({
  id: z.string().min(1),
});

export const getImportJobDetailServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getImportJobDetailSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { NotFoundError } = await import("@bookhouse/shared");

    const job = await db.importJob.findUnique({
      where: { id: data.id },
      include: {
        libraryRoot: { select: { id: true, name: true, path: true } },
      },
    });

    if (!job) {
      throw new NotFoundError("Import job not found", { id: data.id });
    }

    return job;
  });

export type ImportJobDetail = Awaited<
  ReturnType<typeof getImportJobDetailServerFn>
>;

export const getActiveJobCountServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");

  return db.importJob.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
});
