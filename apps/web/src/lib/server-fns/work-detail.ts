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
        tags: { include: { tag: true } },
        editions: {
          include: {
            contributors: { include: { contributor: true } },
            editionFiles: { include: { fileAsset: true } },
          },
        },
      },
    });
  });

export type WorkDetail = Awaited<ReturnType<typeof getWorkDetailServerFn>>;
