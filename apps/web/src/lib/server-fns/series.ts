import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSeriesListServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.series.findMany({
    include: {
      _count: { select: { works: true } },
      works: {
          orderBy: { seriesPosition: "asc" },
          select: {
            id: true,
            titleDisplay: true,
            seriesPosition: true,
            editions: {
              select: {
                contributors: {
                  select: {
                    role: true,
                    contributor: {
                      select: { nameDisplay: true },
                    },
                  },
                },
              },
            },
          },
        },
    },
    orderBy: { name: "asc" },
  });
});

export type SeriesListItem = Awaited<
  ReturnType<typeof getSeriesListServerFn>
>[number];

const getSeriesDetailSchema = z.object({
  seriesId: z.string().min(1),
});

export const getSeriesDetailServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getSeriesDetailSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    return db.series.findUniqueOrThrow({
      where: { id: data.seriesId },
      include: {
        works: {
          orderBy: { seriesPosition: "asc" },
          include: {
            series: true,
            editions: {
              include: {
                contributors: { include: { contributor: true } },
              },
            },
          },
        },
      },
    });
  });

export type SeriesDetail = Awaited<
  ReturnType<typeof getSeriesDetailServerFn>
>;
