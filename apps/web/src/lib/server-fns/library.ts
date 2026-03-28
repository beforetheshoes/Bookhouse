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
  sort: z.enum(["title-asc", "title-desc", "author-asc", "author-desc", "publisher-asc", "publisher-desc", "format-asc", "format-desc", "isbn-asc", "isbn-desc", "recent"]).default("title-asc"),
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

function buildOrderBy(sort: string): Prisma.WorkOrderByWithRelationInput {
  switch (sort) {
    case "title-desc":
      return { titleCanonical: "desc" as const };
    case "recent":
      return { createdAt: "desc" as const };
    default:
      return { titleCanonical: "asc" as const };
  }
}

/** Sort options that require the two-step fetch (edition/contributor fields). */
const EDITION_SORT_OPTIONS = new Set([
  "author-asc", "author-desc",
  "publisher-asc", "publisher-desc",
  "format-asc", "format-desc",
  "isbn-asc", "isbn-desc",
]);

function isEditionSort(sort: string): boolean {
  return EDITION_SORT_OPTIONS.has(sort);
}

const EDITION_SORT_SELECT = {
  id: true,
  editions: {
    select: {
      publisher: true,
      formatFamily: true,
      isbn13: true,
      isbn10: true,
      contributors: {
        where: { role: "AUTHOR" as const },
        select: { contributor: { select: { nameCanonical: true } } },
      },
    },
  },
} as const;

type LightweightEditionWork = {
  id: string;
  editions: {
    publisher: string | null;
    formatFamily: string;
    isbn13: string | null;
    isbn10: string | null;
    contributors: { contributor: { nameCanonical: string } }[];
  }[];
};

function extractSortKey(work: LightweightEditionWork, sort: string): string {
  switch (sort) {
    case "author-asc":
    case "author-desc":
      return work.editions
        .flatMap((e) => e.contributors)
        .map((c) => c.contributor.nameCanonical)
        .sort()[0] ?? "\uffff";
    case "publisher-asc":
    case "publisher-desc":
      return work.editions
        .map((e) => e.publisher ?? "")
        .sort()[0] ?? "\uffff";
    case "format-asc":
    case "format-desc":
      return work.editions
        .map((e) => e.formatFamily)
        .sort()[0] ?? "\uffff";
    case "isbn-asc":
    case "isbn-desc":
      return work.editions
        .map((e) => e.isbn13 ?? e.isbn10 ?? "")
        .sort()[0] ?? "\uffff";
    default:
      return "\uffff";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client's findMany has complex generics that vary by args
type FindMany = (args: any) => Promise<any[]>;
type DbClient = { work: { findMany: FindMany } };

async function fetchWorksWithEditionSort(
  db: DbClient,
  where: Prisma.WorkWhereInput,
  page: number,
  pageSize: number,
  sort: string,
) {
  const direction = sort.endsWith("-desc") ? "desc" : "asc";

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Prisma select narrows the type at runtime
  const allWorks: LightweightEditionWork[] = await db.work.findMany({ where, select: EDITION_SORT_SELECT });

  const sorted = allWorks
    .map((w) => ({ id: w.id, key: extractSortKey(w, sort) }))
    .sort((a, b) =>
      direction === "asc"
        ? a.key.localeCompare(b.key)
        : b.key.localeCompare(a.key),
    );

  const pageIds = sorted
    .slice((page - 1) * pageSize, page * pageSize)
    .map((w) => w.id);

  if (pageIds.length === 0) return [] as Prisma.WorkGetPayload<{ include: typeof WORK_INCLUDE }>[];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Prisma include narrows the type at runtime
  const fullWorks: Prisma.WorkGetPayload<{ include: typeof WORK_INCLUDE }>[] = await db.work.findMany({
    where: { id: { in: pageIds } },
    include: WORK_INCLUDE,
  });

  const idOrder = new Map(pageIds.map((id, i) => [id, i]));
  return fullWorks.sort(
    (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
  );
}

export const getFilteredLibraryWorksServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(filterSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const parsed = filterSchema.parse(data);
    const where = buildWhere(parsed);

    const worksPromise = isEditionSort(parsed.sort)
      ? fetchWorksWithEditionSort(
          db,
          where,
          parsed.page,
          parsed.pageSize,
          parsed.sort,
        )
      : db.work.findMany({
          where,
          orderBy: buildOrderBy(parsed.sort),
          skip: (parsed.page - 1) * parsed.pageSize,
          take: parsed.pageSize,
          include: WORK_INCLUDE,
        });

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
      worksPromise,
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
