import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getShelvesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.collection.findMany({
    include: {
      _count: {
        select: { items: true },
      },
    },
    orderBy: { name: "asc" },
  });
});

export type ShelfRow = Awaited<
  ReturnType<typeof getShelvesServerFn>
>[number];

export const getShelfDetailServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ shelfId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collection.findUniqueOrThrow({
      where: { id: data.shelfId },
      include: {
        items: {
          include: {
            edition: {
              include: {
                work: {
                  include: {
                    series: true,
                  },
                },
                contributors: {
                  include: { contributor: true },
                },
                editionFiles: {
                  include: { fileAsset: true },
                },
              },
            },
          },
          orderBy: { edition: { work: { titleDisplay: "asc" } } },
        },
      },
    });
  });

export type ShelfDetail = Awaited<ReturnType<typeof getShelfDetailServerFn>>;

export const getShelvesForEditionServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ editionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const memberships = await db.collectionItem.findMany({
      where: { editionId: data.editionId },
      select: { collectionId: true },
    });
    return memberships.map((m) => m.collectionId);
  });

export const getShelvesForWorkServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const editions = await db.edition.findMany({
      where: { workId: data.workId },
      select: { id: true },
    });
    const editionIds = editions.map((e) => e.id);
    const [shelves, memberships] = await Promise.all([
      db.collection.findMany({ orderBy: { name: "asc" } }),
      db.collectionItem.findMany({
        where: { editionId: { in: editionIds } },
        select: { collectionId: true },
      }),
    ]);
    const memberIds = new Set(memberships.map((m) => m.collectionId));
    return shelves.map((s) => ({
      id: s.id,
      name: s.name,
      isMember: memberIds.has(s.id),
    }));
  });

export const createShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({
    name: z.string().min(1),
    formatFilter: z.enum(["ALL", "EBOOK", "AUDIOBOOK"]).default("ALL"),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collection.create({
      data: { name: data.name, kind: "MANUAL", formatFilter: data.formatFilter },
    });
  });

export const getAvailableEditionsServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ shelfId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const shelf = await db.collection.findUniqueOrThrow({
      where: { id: data.shelfId },
      select: { formatFilter: true },
    });
    const existing = await db.collectionItem.findMany({
      where: { collectionId: data.shelfId },
      select: { editionId: true },
    });
    const existingIds = existing.map((e) => e.editionId);
    const formatWhere = shelf.formatFilter === "ALL"
      ? {}
      : { formatFamily: shelf.formatFilter };
    return db.edition.findMany({
      where: {
        id: { notIn: existingIds.length > 0 ? existingIds : ["__none__"] },
        ...formatWhere,
        editionFiles: {
          some: {
            role: "PRIMARY",
            fileAsset: { availabilityStatus: "PRESENT" },
          },
        },
      },
      include: {
        work: { include: { series: true } },
        contributors: { include: { contributor: true } },
      },
      orderBy: { work: { titleDisplay: "asc" } },
    });
  });

export type AvailableEdition = Awaited<ReturnType<typeof getAvailableEditionsServerFn>>[number];

export const renameShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collection.update({
      where: { id: data.shelfId },
      data: { name: data.name },
    });
  });

export const deleteShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collection.delete({
      where: { id: data.shelfId },
    });
  });

export const addEditionToShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), editionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collectionItem.create({
      data: { collectionId: data.shelfId, editionId: data.editionId },
    });
  });

export const addEditionsForWorkToShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const shelf = await db.collection.findUniqueOrThrow({
      where: { id: data.shelfId },
      select: { formatFilter: true },
    });
    const formatWhere = shelf.formatFilter === "ALL"
      ? {}
      : { formatFamily: shelf.formatFilter };
    const editions = await db.edition.findMany({
      where: { workId: data.workId, ...formatWhere },
      select: { id: true },
    });
    const editionIds = editions.map((e) => e.id);
    if (editionIds.length === 0) return { added: 0 };
    const existing = await db.collectionItem.findMany({
      where: { collectionId: data.shelfId, editionId: { in: editionIds } },
      select: { editionId: true },
    });
    const existingIds = new Set(existing.map((e) => e.editionId));
    const newEditionIds = editionIds.filter((id) => !existingIds.has(id));
    if (newEditionIds.length > 0) {
      await db.collectionItem.createMany({
        data: newEditionIds.map((editionId) => ({ collectionId: data.shelfId, editionId })),
      });
    }
    return { added: newEditionIds.length };
  });

export const bulkAddToShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), workIds: z.array(z.string().min(1)).min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const shelf = await db.collection.findUniqueOrThrow({
      where: { id: data.shelfId },
      select: { formatFilter: true },
    });
    const formatWhere = shelf.formatFilter === "ALL"
      ? {}
      : { formatFamily: shelf.formatFilter };
    const editions = await db.edition.findMany({
      where: { workId: { in: data.workIds }, ...formatWhere },
      select: { id: true },
    });
    const editionIds = editions.map((e) => e.id);
    if (editionIds.length === 0) return { added: 0 };
    const existing = await db.collectionItem.findMany({
      where: { collectionId: data.shelfId, editionId: { in: editionIds } },
      select: { editionId: true },
    });
    const existingIds = new Set(existing.map((e) => e.editionId));
    const newEditionIds = editionIds.filter((id) => !existingIds.has(id));
    if (newEditionIds.length > 0) {
      await db.collectionItem.createMany({
        data: newEditionIds.map((editionId) => ({ collectionId: data.shelfId, editionId })),
      });
    }
    return { added: newEditionIds.length };
  });

export const removeEditionFromShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), editionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collectionItem.delete({
      where: {
        collectionId_editionId: {
          collectionId: data.shelfId,
          editionId: data.editionId,
        },
      },
    });
  });

export const removeWorkEditionsFromShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const editions = await db.edition.findMany({
      where: { workId: data.workId },
      select: { id: true },
    });
    const editionIds = editions.map((e) => e.id);
    if (editionIds.length === 0) return { removed: 0 };
    const result = await db.collectionItem.deleteMany({
      where: { collectionId: data.shelfId, editionId: { in: editionIds } },
    });
    return { removed: result.count };
  });
