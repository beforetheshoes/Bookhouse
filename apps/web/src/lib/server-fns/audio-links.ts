import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

const idSchema = z.object({ id: z.string() });

export const confirmAudioLinkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    await db.audioLink.update({
      where: { id: data.id },
      data: { reviewStatus: "CONFIRMED" },
    });
    return { success: true };
  });

export const ignoreAudioLinkServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(idSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    await db.audioLink.update({
      where: { id: data.id },
      data: { reviewStatus: "IGNORED" },
    });
    return { success: true };
  });
