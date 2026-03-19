import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  scanMode: z.enum(["FULL", "INCREMENTAL"]).default("INCREMENTAL"),
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
    await db.$transaction([
      db.editionFile.deleteMany({
        where: { fileAsset: { libraryRootId: data.id } },
      }),
      db.fileAsset.deleteMany({
        where: { libraryRootId: data.id },
      }),
      db.importJob.deleteMany({
        where: { libraryRootId: data.id },
      }),
      db.libraryRoot.delete({
        where: { id: data.id },
      }),
    ]);
  });

const libraryRootIdSchema = z.object({
  libraryRootId: z.string().min(1),
});

export const getScanProgressServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(libraryRootIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.importJob.findFirst({
      where: {
        libraryRootId: data.libraryRootId,
        kind: "SCAN_ROOT",
        status: { in: ["QUEUED", "RUNNING"] },
      },
      select: {
        status: true,
        totalFiles: true,
        processedFiles: true,
        errorCount: true,
      },
      orderBy: { createdAt: "desc" },
    });
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
      },
    });

    const jobId = await enqueueLibraryJob(
      LIBRARY_JOB_NAMES.SCAN_LIBRARY_ROOT,
      { libraryRootId: data.libraryRootId, importJobId: importJob.id },
    );

    await db.importJob.update({
      where: { id: importJob.id },
      data: { bullmqJobId: jobId },
    });

    return { jobId, importJobId: importJob.id };
  });
