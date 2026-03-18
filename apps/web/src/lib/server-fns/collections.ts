import { createServerFn } from "@tanstack/react-start";

export const getCollectionsServerFn = createServerFn({
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

export type CollectionRow = Awaited<
  ReturnType<typeof getCollectionsServerFn>
>[number];
