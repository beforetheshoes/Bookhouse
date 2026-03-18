import { createServerFn } from "@tanstack/react-start";

export const getLibraryWorksServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.work.findMany({
    include: {
      editions: {
        include: {
          contributors: {
            include: { contributor: true },
          },
        },
      },
    },
    orderBy: { sortTitle: "asc" },
  });
});

export type LibraryWork = Awaited<
  ReturnType<typeof getLibraryWorksServerFn>
>[number];
