import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAuthorsListServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  const contributors = await db.contributor.findMany({
    where: {
      editions: { some: { role: "AUTHOR" } },
    },
    include: {
      editions: {
        where: { role: "AUTHOR" },
        include: { edition: { select: { workId: true } } },
      },
    },
    orderBy: { nameDisplay: "asc" },
  });
  return contributors.map((c) => ({
    id: c.id,
    nameDisplay: c.nameDisplay,
    workCount: new Set(c.editions.map((ec) => ec.edition.workId)).size,
  }));
});

export type AuthorListItem = Awaited<
  ReturnType<typeof getAuthorsListServerFn>
>[number];

const getAuthorDetailSchema = z.object({
  authorId: z.string().min(1),
});

export const getAuthorDetailServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getAuthorDetailSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const contributor = await db.contributor.findUniqueOrThrow({
      where: { id: data.authorId },
      select: {
        id: true,
        nameDisplay: true,
        nameCanonical: true,
        editions: {
          where: { role: "AUTHOR" },
          select: { edition: { select: { workId: true } } },
        },
      },
    });

    const workIds = [...new Set(contributor.editions.map((ec) => ec.edition.workId))];

    const works = await db.work.findMany({
      where: { id: { in: workIds } },
      include: {
        series: true,
        editions: {
          include: {
            contributors: { include: { contributor: true } },
          },
        },
      },
    });

    return {
      id: contributor.id,
      nameDisplay: contributor.nameDisplay,
      nameCanonical: contributor.nameCanonical,
      works,
    };
  });

export type AuthorDetail = Awaited<
  ReturnType<typeof getAuthorDetailServerFn>
>;
