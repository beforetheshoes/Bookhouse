import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LIVE_SCAN_JOB_STATES = new Set([
  "active",
  "prioritized",
  "waiting",
  "waiting-children",
]);
const GHOST_SCAN_ERROR = "Scan job is no longer active in BullMQ";
const DEADLOCKED_SCAN_ERROR = "Scan job is blocked by a failed child job";

function isScanProgressObject(
  value: unknown,
): value is { processedFiles?: number; errorCount?: number; scanStage?: "DISCOVERY" | "PROCESSING" } {
  return typeof value === "object" && value !== null;
}

function getEffectiveScanStage(
  persistedStage: "DISCOVERY" | "PROCESSING" | null,
  queueState: string | null,
  queueProgress: unknown,
) {
  if (isScanProgressObject(queueProgress) && queueProgress.scanStage) {
    return queueProgress.scanStage;
  }

  if (queueState === "waiting-children") {
    return "PROCESSING" as const;
  }

  return persistedStage;
}

export const getLibraryRootsServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.libraryRoot.findMany({
    select: {
      id: true,
      name: true,
      path: true,
      kind: true,
      scanMode: true,
      isEnabled: true,
      lastScannedAt: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
});

export type LibraryRootRow = Awaited<
  ReturnType<typeof getLibraryRootsServerFn>
>[number];

const addLibraryRootSchema = z.object({
  name: z.string().min(1, "Name is required"),
  path: z.string().min(1, "Path is required"),
  kind: z.enum(["EBOOKS", "AUDIOBOOKS", "MIXED"]),
  scanMode: z.enum(["FULL", "INCREMENTAL"]).default("FULL"),
});

export const addLibraryRootServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(addLibraryRootSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.libraryRoot.create({
      data: {
        name: data.name,
        path: data.path,
        kind: data.kind,
        scanMode: data.scanMode,
      },
    });
  });

const removeLibraryRootSchema = z.object({
  id: z.string().min(1),
});

export const removeLibraryRootServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(removeLibraryRootSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { cascadeCleanupOrphans } = await import("@bookhouse/ingest");

    await db.$transaction(async (tx) => {
      const fileAssets = await tx.fileAsset.findMany({
        where: { libraryRootId: data.id },
        select: { id: true },
      });

      if (fileAssets.length > 0) {
        await cascadeCleanupOrphans(tx as never, {
          fileAssetIds: fileAssets.map((fa) => fa.id),
        });
      }

      await tx.importJob.deleteMany({
        where: { libraryRootId: data.id },
      });

      await tx.libraryRoot.delete({
        where: { id: data.id },
      });
    });
  });

const libraryRootIdSchema = z.object({
  libraryRootId: z.string().min(1),
});

export const STALE_SCAN_THRESHOLD_MS = 5 * 60 * 1000;

export const getScanProgressServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(libraryRootIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { getImportJobLiveActivity, getLibraryJobSnapshot } = await import("@bookhouse/shared");
    const jobs = await db.importJob.findMany({
      where: {
        libraryRootId: data.libraryRootId,
        kind: "SCAN_ROOT",
      },
      select: {
        id: true,
        bullmqJobId: true,
        status: true,
        totalFiles: true,
        processedFiles: true,
        errorCount: true,
        updatedAt: true,
        scanStage: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    for (const job of jobs) {
      const snapshot = job.bullmqJobId
        ? await getLibraryJobSnapshot(job.bullmqJobId)
        : null;
      const queueState = snapshot?.state ?? null;
      const lastActivityAt = Math.max(job.updatedAt.getTime(), snapshot?.lastActivityAt ?? 0);
      const stale = Date.now() - lastActivityAt > STALE_SCAN_THRESHOLD_MS;

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
        const queueProgress = snapshot?.progress;
        return {
          status: "RUNNING" as const,
          totalFiles: job.totalFiles,
          processedFiles: isScanProgressObject(queueProgress) &&
            typeof queueProgress.processedFiles === "number"
            ? queueProgress.processedFiles
            : job.processedFiles,
          errorCount: isScanProgressObject(queueProgress) &&
            typeof queueProgress.errorCount === "number"
            ? queueProgress.errorCount
            : job.errorCount,
          scanStage: getEffectiveScanStage(job.scanStage, queueState, queueProgress),
          stale,
        };
      }

      const fallbackLiveActivity = await getImportJobLiveActivity(job.id);
      if (fallbackLiveActivity !== null) {
        const fallbackLastActivityAt = fallbackLiveActivity.lastActivityAt ?? job.updatedAt.getTime();
        return {
          status: "RUNNING" as const,
          totalFiles: job.totalFiles,
          processedFiles: job.processedFiles,
          errorCount: job.errorCount,
          scanStage: fallbackLiveActivity.scanStage,
          stale: Date.now() - fallbackLastActivityAt > STALE_SCAN_THRESHOLD_MS,
        };
      }

      if (
        stale &&
        (job.status === "QUEUED" || job.status === "RUNNING")
      ) {
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

    return null;
  });

export const getLibraryIssueCountServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(libraryRootIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.fileAsset.count({
      where: {
        libraryRootId: data.libraryRootId,
        metadata: { path: ["status"], equals: "unparseable" },
      },
    });
  });

const libraryIssuesSchema = z.object({
  libraryRootId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const getLibraryIssuesServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(libraryIssuesSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const where = {
      libraryRootId: data.libraryRootId,
      metadata: { path: ["status"], equals: "unparseable" },
    };

    const [items, total] = await Promise.all([
      db.fileAsset.findMany({
        where,
        select: {
          id: true,
          relativePath: true,
          mediaKind: true,
          metadata: true,
          lastSeenAt: true,
        },
        orderBy: { relativePath: "asc" },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      db.fileAsset.count({ where }),
    ]);

    return { items, total };
  });

const scanLibraryRootSchema = z.object({
  libraryRootId: z.string().min(1),
  scanMode: z.enum(["FULL", "INCREMENTAL"]).optional(),
});

export const scanLibraryRootServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(scanLibraryRootSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { enqueueLibraryJob, LIBRARY_JOB_NAMES } = await import(
      "@bookhouse/shared"
    );

    const importJob = await db.importJob.create({
      data: {
        kind: "SCAN_ROOT",
        status: "QUEUED",
        libraryRootId: data.libraryRootId,
        scanStage: "DISCOVERY",
      },
    });

    const jobId = await enqueueLibraryJob(
      LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT,
      {
        libraryRootId: data.libraryRootId,
        importJobId: importJob.id,
        ...(data.scanMode ? { scanMode: data.scanMode } : {}),
      },
    );

    await db.importJob.update({
      where: { id: importJob.id },
      data: { bullmqJobId: jobId },
    });

    return { jobId, importJobId: importJob.id };
  });

export const retryLibraryIssuesServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(libraryRootIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { createIngestServices } = await import("@bookhouse/ingest");
    const { enqueueLibraryJob } = await import("@bookhouse/shared");

    const issues = await db.fileAsset.findMany({
      where: {
        libraryRootId: data.libraryRootId,
        metadata: { path: ["status"], equals: "unparseable" },
      },
      select: { id: true },
    });

    const services = createIngestServices({
      async enqueueLibraryJob(jobName, payload) {
        await enqueueLibraryJob(jobName, payload);
      },
    });
    for (const issue of issues) {
      await services.parseFileAssetMetadata({ fileAssetId: issue.id });
    }

    return { retriedCount: issues.length };
  });
