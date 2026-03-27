import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma } from "@bookhouse/db";

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
  return db.work.findMany({
    where: {
      editions: {
        some: {
          editionFiles: {
            some: {
              fileAsset: { availabilityStatus: "PRESENT" },
            },
          },
        },
      },
    },
    include: WORK_INCLUDE,
  });
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
  enriched: z.boolean().optional(),
  hasDescription: z.boolean().optional(),
  inSeries: z.boolean().optional(),
  hasIsbn: z.boolean().optional(),
});

function buildWhere(data: z.infer<typeof filterSchema>): Prisma.WorkWhereInput {
  const where: Prisma.WorkWhereInput = {};

  if (data.q) {
    where.OR = [
      { titleDisplay: { contains: data.q, mode: "insensitive" } },
      { titleCanonical: { contains: data.q, mode: "insensitive" } },
    ];
  }

  const editionConditions: Prisma.EditionWhereInput[] = [];

  if (data.format && data.format.length > 0) {
    editionConditions.push({ formatFamily: { in: data.format } });
  }

  if (data.authorId && data.authorId.length > 0) {
    editionConditions.push({
      contributors: {
        some: {
          contributorId: { in: data.authorId },
          role: "AUTHOR",
        },
      },
    });
  }

  if (data.publisher && data.publisher.length > 0) {
    editionConditions.push({ publisher: { in: data.publisher } });
  }

  if (editionConditions.length === 1) {
    where.editions = { some: editionConditions[0] };
  } else if (editionConditions.length > 1) {
    where.editions = { some: { AND: editionConditions } };
  }

  if (data.seriesId && data.seriesId.length > 0) {
    where.seriesId = { in: data.seriesId };
  }

  if (data.hasCover === true) {
    where.coverPath = { not: null };
  } else if (data.hasCover === false) {
    where.coverPath = null;
  }

  if (data.enriched === true) {
    where.enrichmentStatus = "ENRICHED";
  } else if (data.enriched === false) {
    where.enrichmentStatus = "STUB";
  }

  if (data.hasDescription === true) {
    where.description = { not: null };
  } else if (data.hasDescription === false) {
    where.description = null;
  }

  if (data.inSeries === true) {
    where.seriesId = { not: null };
  } else if (data.inSeries === false) {
    where.seriesId = null;
  }

  if (data.hasIsbn === true) {
    editionConditions.push({
      OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }],
    });
  } else if (data.hasIsbn === false) {
    editionConditions.push({ isbn13: null, isbn10: null });
  }

  where.AND = [
    {
      editions: {
        some: {
          editionFiles: {
            some: {
              fileAsset: { availabilityStatus: "PRESENT" },
            },
          },
        },
      },
    },
  ];

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

    // Facet counts exclude their own filter to show meaningful counts
    const whereForCoverFacets = buildWhere({ ...parsed, hasCover: undefined });
    const whereForFormatFacets = buildWhere({ ...parsed, format: undefined });
    const whereForEnrichmentFacets = buildWhere({ ...parsed, enriched: undefined });
    const whereForDescriptionFacets = buildWhere({ ...parsed, hasDescription: undefined });
    const whereForSeriesFacets = buildWhere({ ...parsed, inSeries: undefined, seriesId: undefined });
    const whereForIsbnFacets = buildWhere({ ...parsed, hasIsbn: undefined });

    const [
      works, totalCount, formatCounts,
      withCoverCount, withoutCoverCount,
      enrichedCount, unenrichedCount,
      withDescriptionCount, withoutDescriptionCount,
      inSeriesCount, standaloneCount,
      withIsbnCount, withoutIsbnCount,
    ] = await Promise.all([
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
        where: { work: whereForFormatFacets },
      }),
      db.work.count({ where: { ...whereForCoverFacets, coverPath: { not: null } } }),
      db.work.count({ where: { ...whereForCoverFacets, coverPath: null } }),
      db.work.count({ where: { ...whereForEnrichmentFacets, enrichmentStatus: "ENRICHED" } }),
      db.work.count({ where: { ...whereForEnrichmentFacets, enrichmentStatus: "STUB" } }),
      db.work.count({ where: { ...whereForDescriptionFacets, description: { not: null } } }),
      db.work.count({ where: { ...whereForDescriptionFacets, description: null } }),
      db.work.count({ where: { ...whereForSeriesFacets, seriesId: { not: null } } }),
      db.work.count({ where: { ...whereForSeriesFacets, seriesId: null } }),
      db.work.count({
        where: {
          ...whereForIsbnFacets,
          editions: { some: { OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }] } },
        },
      }),
      db.work.count({
        where: {
          ...whereForIsbnFacets,
          editions: { every: { isbn13: null, isbn10: null } },
        },
      }),
    ]);

    return {
      works,
      totalCount,
      facetCounts: {
        format: formatCounts,
        hasCover: {
          withCover: withCoverCount,
          withoutCover: withoutCoverCount,
        },
        enrichment: {
          enriched: enrichedCount,
          unenriched: unenrichedCount,
        },
        description: {
          withDescription: withDescriptionCount,
          withoutDescription: withoutDescriptionCount,
        },
        series: {
          inSeries: inSeriesCount,
          standalone: standaloneCount,
        },
        isbn: {
          withIsbn: withIsbnCount,
          withoutIsbn: withoutIsbnCount,
        },
      },
    };
  });

export type FilteredLibraryResult = Awaited<
  ReturnType<typeof getFilteredLibraryWorksServerFn>
>;
