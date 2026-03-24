import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LIVE_SCAN_JOB_STATES = new Set([
  "active",
  "prioritized",
  "waiting",
  "waiting-children",
]);
const STALE_SCAN_THRESHOLD_MS = 5 * 60 * 1000;
const GHOST_SCAN_ERROR = "Scan job is no longer active in BullMQ";
const DEADLOCKED_SCAN_ERROR = "Scan job is blocked by a failed child job";

const importJobStatusValues = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const;
const importJobKindValues = [
  "SCAN_ROOT",
  "HASH_FILE",
  "PARSE_FILE",
  "REFRESH_METADATA",
  "DETECT_DUPLICATES",
  "MATCH_SUGGESTIONS",
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
    const { getImportJobLiveActivity, getLibraryJobSnapshot } = await import("@bookhouse/shared");

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

    const hydratedJobs = await Promise.all(jobs.map(async (job) => {
      if (job.kind !== "SCAN_ROOT" || !job.bullmqJobId) {
        if (job.kind !== "SCAN_ROOT") {
          return job;
        }
        const fallbackLiveActivity = await getImportJobLiveActivity(job.id);
        if (fallbackLiveActivity === null) {
          return job;
        }
        return {
          ...job,
          status: "RUNNING" as const,
          finishedAt: null,
        };
      }

      const snapshot = await getLibraryJobSnapshot(job.bullmqJobId);
      const queueState = snapshot?.state ?? null;
      if (snapshot?.blockedByFailedChild) {
        await db.importJob.updateMany({
          where: { id: job.id, status: { not: "FAILED" } },
          data: {
            status: "FAILED",
            error: DEADLOCKED_SCAN_ERROR,
            finishedAt: new Date(),
            scanStage: null,
            bullmqJobId: null,
          },
        });
        return {
          ...job,
          status: "FAILED" as const,
          error: DEADLOCKED_SCAN_ERROR,
          finishedAt: new Date(),
        };
      }
      if (!LIVE_SCAN_JOB_STATES.has(queueState ?? "")) {
        const fallbackLiveActivity = await getImportJobLiveActivity(job.id);
        if (fallbackLiveActivity === null) {
          return job;
        }
        return {
          ...job,
          status: "RUNNING" as const,
          finishedAt: null,
        };
      }

      return {
        ...job,
        status: "RUNNING" as const,
        finishedAt: null,
      };
    }));

    return { jobs: hydratedJobs, totalCount, page: data.page, pageSize: data.pageSize };
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
  const { getImportJobLiveActivity, getLibraryJobSnapshot } = await import("@bookhouse/shared");
  const now = Date.now();

  const jobs = await db.importJob.findMany({
    where: { kind: "SCAN_ROOT", status: { not: "FAILED" } },
    select: { id: true, bullmqJobId: true, updatedAt: true, status: true },
  });

  let liveCount = 0;
  for (const job of jobs) {
    if (!job.bullmqJobId) {
      if (await getImportJobLiveActivity(job.id)) {
        liveCount++;
      }
      continue;
    }
    const snapshot = job.bullmqJobId
      ? await getLibraryJobSnapshot(job.bullmqJobId)
      : null;
    const queueState = snapshot?.state ?? null;
    if (snapshot?.blockedByFailedChild) {
      await db.importJob.updateMany({
        where: { id: job.id, status: { not: "FAILED" } },
        data: {
          status: "FAILED",
          error: DEADLOCKED_SCAN_ERROR,
          finishedAt: new Date(),
          scanStage: null,
          bullmqJobId: null,
        },
      });
      continue;
    }
    if (LIVE_SCAN_JOB_STATES.has(queueState ?? "")) {
      liveCount++;
      continue;
    }

    if (await getImportJobLiveActivity(job.id)) {
      liveCount++;
      continue;
    }

    if (now - job.updatedAt.getTime() > STALE_SCAN_THRESHOLD_MS) {
      await db.importJob.updateMany({
        where: { id: job.id, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "FAILED",
          error: GHOST_SCAN_ERROR,
          finishedAt: new Date(),
          scanStage: null,
          bullmqJobId: null,
        },
      });
    }
  }

  return liveCount;
});

export const stopAllJobsServerFn = createServerFn({
  method: "POST",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const { obliterateLibraryQueue } = await import("@bookhouse/shared");

  await obliterateLibraryQueue();

  const result = await db.importJob.updateMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "FAILED", error: "Stopped by user", finishedAt: new Date(), bullmqJobId: null, scanStage: null },
  });

  return { stoppedCount: result.count };
});
