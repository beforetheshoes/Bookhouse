import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAudioLinksServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const links = await db.audioLink.findMany({
    include: {
      ebookEdition: {
        include: {
          work: true,
          contributors: { include: { contributor: true } },
          editionFiles: {
            include: {
              fileAsset: {
                select: { absolutePath: true, mediaKind: true },
              },
            },
          },
        },
      },
      audioEdition: {
        include: {
          work: true,
          contributors: { include: { contributor: true } },
          editionFiles: {
            include: {
              fileAsset: {
                select: { absolutePath: true, mediaKind: true },
              },
            },
          },
        },
      },
    },
    orderBy: { confidence: "desc" },
  });

  // Filter out links where the audio edition has no actual audio files
  // (e.g., sidecar-only editions from the duplicate edition bug)
  return links.filter((link) =>
    link.audioEdition.editionFiles.some((ef) => ef.fileAsset.mediaKind === "AUDIO"),
  );
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
