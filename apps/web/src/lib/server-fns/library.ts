import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const WORK_INCLUDE = {
  series: true,
  editions: {
    include: {
      contributors: {
        include: { contributor: true },
      },
    },
  },
} as const;

export const getLibraryWorksServerFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { db } = await import("@bookhouse/db");
  return db.work.findMany({ include: WORK_INCLUDE });
});

export type LibraryWork = Awaited<
  ReturnType<typeof getLibraryWorksServerFn>
>[number];

const filterSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  sort: z.enum(["title-asc", "title-desc", "recent"]).default("title-asc"),
  q: z.string().optional(),
  format: z.array(z.enum(["EBOOK", "AUDIOBOOK"])).optional(),
  authorId: z.array(z.string()).optional(),
  seriesId: z.array(z.string()).optional(),
  publisher: z.array(z.string()).optional(),
  hasCover: z.boolean().optional(),
});

type WhereClause = Record<string, unknown>;

function buildWhere(data: z.infer<typeof filterSchema>): WhereClause {
  const where: WhereClause = {};

  if (data.q) {
    where.OR = [
      { titleDisplay: { contains: data.q, mode: "insensitive" } },
      { titleCanonical: { contains: data.q, mode: "insensitive" } },
    ];
  }

  if (data.format && data.format.length > 0) {
    where.editions = { some: { formatFamily: { in: data.format } } };
  }

  if (data.authorId && data.authorId.length > 0) {
    where.editions = {
      some: {
        contributors: {
          some: {
            contributorId: { in: data.authorId },
            role: "AUTHOR",
          },
        },
      },
    };
  }

  if (data.publisher && data.publisher.length > 0) {
    where.editions = { some: { publisher: { in: data.publisher } } };
  }

  if (data.seriesId && data.seriesId.length > 0) {
    where.seriesId = { in: data.seriesId };
  }

  if (data.hasCover === true) {
    where.coverPath = { not: null };
  } else if (data.hasCover === false) {
    where.coverPath = null;
  }

  return where;
}

function buildOrderBy(sort: string) {
  switch (sort) {
    case "title-desc":
      return { titleCanonical: "desc" as const };
    case "recent":
      return { createdAt: "desc" as const };
    default:
      return { titleCanonical: "asc" as const };
  }
}

export const getFilteredLibraryWorksServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(filterSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const parsed = filterSchema.parse(data);
    const where = buildWhere(parsed);
    const orderBy = buildOrderBy(parsed.sort);

    const [works, totalCount, formatCounts, withCoverCount, seriesCount] =
      await Promise.all([
        db.work.findMany({
          where,
          orderBy,
          skip: (parsed.page - 1) * parsed.pageSize,
          take: parsed.pageSize,
          include: WORK_INCLUDE,
        }),
        db.work.count({ where }),
        db.edition.groupBy({
          by: ["formatFamily"],
          _count: { _all: true },
        }),
        db.work.count({ where: { coverPath: { not: null } } }),
        db.series.count(),
      ]);

    return {
      works,
      totalCount,
      facetCounts: {
        format: formatCounts,
        hasCover: {
          withCover: withCoverCount,
          withoutCover: totalCount - withCoverCount,
        },
        series: seriesCount,
      },
    };
  });

export type FilteredLibraryResult = Awaited<
  ReturnType<typeof getFilteredLibraryWorksServerFn>
>;
