import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const deleteWorkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    await db.work.delete({ where: { id: data.workId } });
    return { deletedWorkId: data.workId };
  });

export const deleteEditionServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ editionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const edition = await db.edition.findUnique({ where: { id: data.editionId } });
    if (!edition) {
      throw new Error("Edition not found");
    }

    await db.edition.delete({ where: { id: data.editionId } });

    const remainingEditions = await db.edition.count({ where: { workId: edition.workId } });
    if (remainingEditions === 0) {
      await db.work.delete({ where: { id: edition.workId } });
      return { deletedEditionId: data.editionId, deletedWorkId: edition.workId };
    }

    return { deletedEditionId: data.editionId, deletedWorkId: null };
  });

export const bulkDeleteWorksServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ workIds: z.array(z.string().min(1)).max(100) }))
  .handler(async ({ data }) => {
    if (data.workIds.length === 0) {
      return { deletedWorkIds: [] as string[] };
    }

    const { db } = await import("@bookhouse/db");
    await db.work.deleteMany({ where: { id: { in: data.workIds } } });
    return { deletedWorkIds: data.workIds };
  });

export const bulkDeleteEditionsServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ editionIds: z.array(z.string().min(1)).max(100) }))
  .handler(async ({ data }) => {
    if (data.editionIds.length === 0) {
      return { deletedEditionIds: [] as string[], deletedWorkIds: [] as string[] };
    }

    const { db } = await import("@bookhouse/db");

    const editions = await db.edition.findMany({
      where: { id: { in: data.editionIds } },
      select: { id: true, workId: true },
    });
    const affectedWorkIds = [...new Set(editions.map((e: { workId: string }) => e.workId))];

    await db.edition.deleteMany({ where: { id: { in: data.editionIds } } });

    const emptyWorkIds: string[] = [];
    for (const workId of affectedWorkIds) {
      const remaining = await db.edition.count({ where: { workId } });
      if (remaining === 0) {
        emptyWorkIds.push(workId);
      }
    }

    if (emptyWorkIds.length > 0) {
      await db.work.deleteMany({ where: { id: { in: emptyWorkIds } } });
    }

    return { deletedEditionIds: data.editionIds, deletedWorkIds: emptyWorkIds };
  });

export const bulkDeleteEditionsByFormatForWorksServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({
    workIds: z.array(z.string().min(1)).max(100),
    format: z.enum(["EBOOK", "AUDIOBOOK"]),
  }))
  .handler(async ({ data }) => {
    if (data.workIds.length === 0) {
      return { deletedEditionIds: [] as string[], deletedWorkIds: [] as string[] };
    }

    const { db } = await import("@bookhouse/db");

    const editions = await db.edition.findMany({
      where: { workId: { in: data.workIds }, formatFamily: data.format },
      select: { id: true, workId: true },
    });

    if (editions.length === 0) {
      return { deletedEditionIds: [] as string[], deletedWorkIds: [] as string[] };
    }

    const affectedWorkIds = [...new Set(editions.map((e: { workId: string }) => e.workId))];
    const deletedEditionIds = editions.map((e: { id: string }) => e.id);

    await db.edition.deleteMany({ where: { id: { in: deletedEditionIds } } });

    const emptyWorkIds: string[] = [];
    for (const workId of affectedWorkIds) {
      const remaining = await db.edition.count({ where: { workId } });
      if (remaining === 0) {
        emptyWorkIds.push(workId);
      }
    }

    if (emptyWorkIds.length > 0) {
      await db.work.deleteMany({ where: { id: { in: emptyWorkIds } } });
    }

    return { deletedEditionIds, deletedWorkIds: emptyWorkIds };
  });

export const deleteAllEditionsByFormatServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({
    format: z.enum(["EBOOK", "AUDIOBOOK"]),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const editions = await db.edition.findMany({
      where: { formatFamily: data.format },
      select: { id: true, workId: true },
    });

    if (editions.length === 0) {
      return { deletedEditionIds: [] as string[], deletedWorkIds: [] as string[] };
    }

    const affectedWorkIds = [...new Set(editions.map((e: { workId: string }) => e.workId))];
    const deletedEditionIds = editions.map((e: { id: string }) => e.id);

    await db.edition.deleteMany({ where: { id: { in: deletedEditionIds } } });

    const emptyWorkIds: string[] = [];
    for (const workId of affectedWorkIds) {
      const remaining = await db.edition.count({ where: { workId } });
      if (remaining === 0) {
        emptyWorkIds.push(workId);
      }
    }

    if (emptyWorkIds.length > 0) {
      await db.work.deleteMany({ where: { id: { in: emptyWorkIds } } });
    }

    return { deletedEditionIds, deletedWorkIds: emptyWorkIds };
  });

const missingFilesPaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const getMissingFilesServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(missingFilesPaginationSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const where = { availabilityStatus: "MISSING" as const };

    const [items, total] = await Promise.all([
      db.fileAsset.findMany({
        where,
        select: {
          id: true,
          relativePath: true,
          mediaKind: true,
          lastSeenAt: true,
          editionFiles: {
            select: {
              edition: {
                select: {
                  id: true,
                  formatFamily: true,
                  work: { select: { id: true, titleDisplay: true } },
                },
              },
            },
          },
        },
        orderBy: { relativePath: "asc" },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
      }),
      db.fileAsset.count({ where }),
    ]);

    return { items, total };
  });

export const cleanupMissingFilesServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ fileAssetIds: z.array(z.string().min(1)) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { cascadeCleanupOrphans } = await import("@bookhouse/ingest");

    const missingCount = await db.fileAsset.count({
      where: { id: { in: data.fileAssetIds }, availabilityStatus: "MISSING" },
    });

    if (missingCount !== data.fileAssetIds.length) {
      throw new Error("Not all specified files have MISSING status");
    }

    return cascadeCleanupOrphans(db, { fileAssetIds: data.fileAssetIds });
  });
