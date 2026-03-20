import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const getWorkDetailSchema = z.object({
  workId: z.string().min(1),
});

export const getWorkDetailServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getWorkDetailSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    return db.work.findUniqueOrThrow({
      where: { id: data.workId },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
            ebookLinks: {
              where: { reviewStatus: "CONFIRMED" },
              include: { audioEdition: { include: { work: true } } },
            },
            audioLinks: {
              where: { reviewStatus: "CONFIRMED" },
              include: { ebookEdition: { include: { work: true } } },
            },
          },
        },
      },
    });
  });

export type WorkDetail = Awaited<ReturnType<typeof getWorkDetailServerFn>>;
