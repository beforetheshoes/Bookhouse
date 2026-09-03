import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const getWorkDetailSchema = z.object({
  workId: z.string().min(1),
});

export const getWorkDetailServerFn = createServerFn({
  method: "GET",
})
  .validator(getWorkDetailSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    // null rather than a throw: the loader turns it into a proper 404 page
    // instead of the generic "Something went wrong" boundary.
    return db.work.findUnique({
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

export type WorkDetail = NonNullable<Awaited<ReturnType<typeof getWorkDetailServerFn>>>;
