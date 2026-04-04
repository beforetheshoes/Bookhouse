import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma } from "@bookhouse/db";

const FORMAT_FAMILIES = ["EBOOK", "AUDIOBOOK"] as const;

const KEPUB_EXCLUDED_MEDIA_KINDS = ["KEPUB", "COVER", "SIDECAR"] as const;

type FormatCount = { formatFamily: string; _count: { _all: number } };

function normalizeFormatCounts(
  raw: FormatCount[],
): FormatCount[] {
  const map = new Map(raw.map((r) => [r.formatFamily, r._count._all]));
  return FORMAT_FAMILIES.map((ff) => ({
    formatFamily: ff,
    _count: { _all: map.get(ff) ?? 0 },
  }));
}

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
              fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: [...KEPUB_EXCLUDED_MEDIA_KINDS] } },
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

  if (data.hasIsbn === true) {
    editionConditions.push({
      OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }],
    });
  } else if (data.hasIsbn === false) {
    editionConditions.push({ isbn13: null, isbn10: null });
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

  where.AND = [
    {
      editions: {
        some: {
          editionFiles: {
            some: {
              fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: [...KEPUB_EXCLUDED_MEDIA_KINDS] } },
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

type EditionSortOption = "author-asc" | "author-desc" | "publisher-asc" | "publisher-desc" | "format-asc" | "format-desc" | "isbn-asc" | "isbn-desc";

function extractSortKey(work: LightweightEditionWork, sort: EditionSortOption): string {
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
  sort: EditionSortOption,
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

  // Reorder fullWorks to match pageIds order
  const byId = Object.fromEntries(fullWorks.map((w) => [w.id, w]));
  return pageIds.map((id) => byId[id]).filter(Boolean) as typeof fullWorks;
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
          parsed.sort as EditionSortOption,
        )
      : db.work.findMany({
          where,
          orderBy: buildOrderBy(parsed.sort),
          skip: (parsed.page - 1) * parsed.pageSize,
          take: parsed.pageSize,
          include: WORK_INCLUDE,
        });

    // Facet counts use full filter set so counts always match the filtered view
    const baseWhere = buildWhere(filterSchema.parse({}));

    const [
      works, totalCount, formatCounts,
      withCoverCount, withoutCoverCount,
      enrichedCount, unenrichedCount,
      withDescriptionCount, withoutDescriptionCount,
      inSeriesCount, standaloneCount,
      withIsbnCount, withoutIsbnCount,
      totalFormatCounts,
      totalWithCoverCount, totalWithoutCoverCount,
      totalEnrichedCount, totalUnenrichedCount,
      totalWithDescriptionCount, totalWithoutDescriptionCount,
      totalInSeriesCount, totalStandaloneCount,
      totalWithIsbnCount, totalWithoutIsbnCount,
    ] = await Promise.all([
      worksPromise,
      db.work.count({ where }),
      db.edition.groupBy({
        by: ["formatFamily"],
        _count: { _all: true },
        where: { work: where },
      }),
      // Use AND to combine so facet conditions don't override active filter conditions
      db.work.count({ where: { AND: [where, { coverPath: { not: null } }] } }),
      db.work.count({ where: { AND: [where, { coverPath: null }] } }),
      db.work.count({ where: { AND: [where, { enrichmentStatus: "ENRICHED" }] } }),
      db.work.count({ where: { AND: [where, { enrichmentStatus: "STUB" }] } }),
      db.work.count({ where: { AND: [where, { description: { not: null } }] } }),
      db.work.count({ where: { AND: [where, { description: null }] } }),
      db.work.count({ where: { AND: [where, { seriesId: { not: null } }] } }),
      db.work.count({ where: { AND: [where, { seriesId: null }] } }),
      db.work.count({
        where: { AND: [where, { editions: { some: { OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }] } } }] },
      }),
      db.work.count({
        where: { AND: [where, { editions: { every: { isbn13: null, isbn10: null } } }] },
      }),
      // Unfiltered totals for showing "filtered / total" in the UI
      db.edition.groupBy({
        by: ["formatFamily"],
        _count: { _all: true },
        where: { work: baseWhere },
      }),
      db.work.count({ where: { AND: [baseWhere, { coverPath: { not: null } }] } }),
      db.work.count({ where: { AND: [baseWhere, { coverPath: null }] } }),
      db.work.count({ where: { AND: [baseWhere, { enrichmentStatus: "ENRICHED" }] } }),
      db.work.count({ where: { AND: [baseWhere, { enrichmentStatus: "STUB" }] } }),
      db.work.count({ where: { AND: [baseWhere, { description: { not: null } }] } }),
      db.work.count({ where: { AND: [baseWhere, { description: null }] } }),
      db.work.count({ where: { AND: [baseWhere, { seriesId: { not: null } }] } }),
      db.work.count({ where: { AND: [baseWhere, { seriesId: null }] } }),
      db.work.count({
        where: { AND: [baseWhere, { editions: { some: { OR: [{ isbn13: { not: null } }, { isbn10: { not: null } }] } } }] },
      }),
      db.work.count({
        where: { AND: [baseWhere, { editions: { every: { isbn13: null, isbn10: null } } }] },
      }),
    ]);

    return {
      works,
      totalCount,
      facetCounts: {
        format: normalizeFormatCounts(formatCounts),
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
      totalFacetCounts: {
        format: normalizeFormatCounts(totalFormatCounts),
        hasCover: {
          withCover: totalWithCoverCount,
          withoutCover: totalWithoutCoverCount,
        },
        enrichment: {
          enriched: totalEnrichedCount,
          unenriched: totalUnenrichedCount,
        },
        description: {
          withDescription: totalWithDescriptionCount,
          withoutDescription: totalWithoutDescriptionCount,
        },
        series: {
          inSeries: totalInSeriesCount,
          standalone: totalStandaloneCount,
        },
        isbn: {
          withIsbn: totalWithIsbnCount,
          withoutIsbn: totalWithoutIsbnCount,
        },
      },
    };
  });

export type FilteredLibraryResult = Awaited<
  ReturnType<typeof getFilteredLibraryWorksServerFn>
>;

const idsOnlyFilterSchema = filterSchema.omit({ page: true, pageSize: true, sort: true });

export const getAllFilteredWorkIdsServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(idsOnlyFilterSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const parsed = idsOnlyFilterSchema.parse(data);
    const where = buildWhere({ ...parsed, page: 1, pageSize: 1, sort: "title-asc" });

    const works = await db.work.findMany({
      where,
      select: { id: true },
    });

    return works.map((w: { id: string }) => w.id);
  });
