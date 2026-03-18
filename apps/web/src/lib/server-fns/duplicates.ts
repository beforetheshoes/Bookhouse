import { createServerFn } from "@tanstack/react-start";

export const getDuplicatesServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.duplicateCandidate.findMany({
    include: {
      leftEdition: {
        include: {
          work: true,
          contributors: { include: { contributor: true } },
        },
      },
      rightEdition: {
        include: {
          work: true,
          contributors: { include: { contributor: true } },
        },
      },
      leftFileAsset: true,
      rightFileAsset: true,
    },
    orderBy: { confidence: "desc" },
  });
});

export type DuplicateRow = Awaited<
  ReturnType<typeof getDuplicatesServerFn>
>[number];
