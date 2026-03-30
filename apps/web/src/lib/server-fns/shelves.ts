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
            work: {
              include: {
                series: true,
                editions: {
                  include: {
                    contributors: {
                      include: { contributor: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { work: { titleDisplay: "asc" } },
        },
      },
    });
  });

export type ShelfDetail = Awaited<ReturnType<typeof getShelfDetailServerFn>>;

export const getShelvesForWorkServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const [shelves, memberships] = await Promise.all([
      db.collection.findMany({ orderBy: { name: "asc" } }),
      db.collectionItem.findMany({
        where: { workId: data.workId },
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
  .inputValidator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collection.create({
      data: { name: data.name, kind: "MANUAL" },
    });
  });

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

export const addWorkToShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collectionItem.create({
      data: { collectionId: data.shelfId, workId: data.workId },
    });
  });

export const bulkAddToShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), workIds: z.array(z.string().min(1)).min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const existing = await db.collectionItem.findMany({
      where: { collectionId: data.shelfId, workId: { in: data.workIds } },
      select: { workId: true },
    });
    const existingIds = new Set(existing.map((e) => e.workId));
    const newWorkIds = data.workIds.filter((id) => !existingIds.has(id));
    if (newWorkIds.length > 0) {
      await db.collectionItem.createMany({
        data: newWorkIds.map((workId) => ({ collectionId: data.shelfId, workId })),
      });
    }
    return { added: newWorkIds.length };
  });

export const removeWorkFromShelfServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ shelfId: z.string().min(1), workId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.collectionItem.delete({
      where: {
        collectionId_workId: {
          collectionId: data.shelfId,
          workId: data.workId,
        },
      },
    });
  });
