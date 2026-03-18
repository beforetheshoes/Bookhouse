import { createServerFn } from "@tanstack/react-start";

export const getAudioLinksServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.audioLink.findMany({
    include: {
      ebookEdition: {
        include: {
          work: true,
          contributors: { include: { contributor: true } },
        },
      },
      audioEdition: {
        include: {
          work: true,
          contributors: { include: { contributor: true } },
        },
      },
    },
    orderBy: { confidence: "desc" },
  });
});

export type AudioLinkRow = Awaited<
  ReturnType<typeof getAudioLinksServerFn>
>[number];
