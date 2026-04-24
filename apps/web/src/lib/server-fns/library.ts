import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma } from "@bookhouse/db";
import { SORT_OPTIONS } from "~/lib/library-search-schema";

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
  sort: z.enum(SORT_OPTIONS).default("title-asc"),
  q: z.string().optional(),
  format: z.array(z.enum(["EBOOK", "AUDIOBOOK"])).optional(),
  authorId: z.array(z.string()).optional(),
  seriesId: z.array(z.string()).optional(),
  hasCover: z.boolean().optional(),
  enriched: z.boolean().optional(),
  hasDescription: z.boolean().optional(),
  inSeries: z.boolean().optional(),
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
      return { sortTitle: { sort: "desc" as const, nulls: "last" as const } };
    case "recent":
      return { createdAt: "desc" as const };
    default:
      return { sortTitle: { sort: "asc" as const, nulls: "last" as const } };
  }
}

/** Sort options that require the two-step fetch (edition/contributor fields). */
const EDITION_SORT_OPTIONS = new Set([
  "author-asc", "author-desc",
  "format-asc", "format-desc",
]);

function isEditionSort(sort: string): boolean {
  return EDITION_SORT_OPTIONS.has(sort);
}

const EDITION_SORT_SELECT = {
  id: true,
  editions: {
    select: {
      formatFamily: true,
      contributors: {
        where: { role: "AUTHOR" as const },
        select: { contributor: { select: { nameSort: true, nameCanonical: true } } },
      },
    },
  },
} as const;

type LightweightEditionWork = {
  id: string;
  editions: {
    formatFamily: string;
    contributors: { contributor: { nameSort: string | null; nameCanonical: string } }[];
  }[];
};

type EditionSortOption = "author-asc" | "author-desc" | "format-asc" | "format-desc";

function extractSortKey(work: LightweightEditionWork, sort: EditionSortOption): string {
  switch (sort) {
    case "author-asc":
    case "author-desc":
      return work.editions
        .flatMap((e) => e.contributors)
        .map((c) => c.contributor.nameSort ?? c.contributor.nameCanonical)
        .sort()[0] ?? "\uffff";
    case "format-asc":
    case "format-desc":
      return work.editions
        .map((e) => e.formatFamily)
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
      totalFormatCounts,
      totalWithCoverCount, totalWithoutCoverCount,
      totalEnrichedCount, totalUnenrichedCount,
      totalWithDescriptionCount, totalWithoutDescriptionCount,
      totalInSeriesCount, totalStandaloneCount,
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
      },
    };
  });

export type FilteredLibraryResult = Awaited<
  ReturnType<typeof getFilteredLibraryWorksServerFn>
>;

// ---------- Editions view ----------

const EDITION_VIEW_INCLUDE = {
  work: {
    include: {
      series: true,
      editions: {
        include: {
          contributors: {
            where: { role: "AUTHOR" as const },
            include: { contributor: true },
          },
        },
      },
    },
  },
  contributors: { include: { contributor: true } },
} as const;

function buildEditionWhere(data: z.infer<typeof filterSchema>): Prisma.EditionWhereInput {
  const where: Prisma.EditionWhereInput = {};
  const workConditions: Prisma.WorkWhereInput[] = [];

  if (data.q) {
    workConditions.push({
      OR: [
        { titleDisplay: { contains: data.q, mode: "insensitive" } },
        { titleCanonical: { contains: data.q, mode: "insensitive" } },
      ],
    });
  }

  if (data.format && data.format.length > 0) {
    where.formatFamily = { in: data.format };
  }

  if (data.authorId && data.authorId.length > 0) {
    where.contributors = {
      some: {
        contributorId: { in: data.authorId },
        role: "AUTHOR",
      },
    };
  }

  if (data.seriesId && data.seriesId.length > 0) {
    workConditions.push({ seriesId: { in: data.seriesId } });
  }

  if (data.hasCover === true) {
    workConditions.push({ coverPath: { not: null } });
  } else if (data.hasCover === false) {
    workConditions.push({ coverPath: null });
  }

  if (data.enriched === true) {
    workConditions.push({ enrichmentStatus: "ENRICHED" });
  } else if (data.enriched === false) {
    workConditions.push({ enrichmentStatus: "STUB" });
  }

  if (data.hasDescription === true) {
    workConditions.push({ description: { not: null } });
  } else if (data.hasDescription === false) {
    workConditions.push({ description: null });
  }

  if (data.inSeries === true) {
    workConditions.push({ seriesId: { not: null } });
  } else if (data.inSeries === false) {
    workConditions.push({ seriesId: null });
  }

  if (workConditions.length === 1) {
    where.work = workConditions[0];
  } else if (workConditions.length > 1) {
    where.work = { AND: workConditions };
  }

  where.editionFiles = {
    some: {
      fileAsset: { availabilityStatus: "PRESENT", mediaKind: { notIn: [...KEPUB_EXCLUDED_MEDIA_KINDS] } },
    },
  };

  return where;
}

type EditionOrderBy = Prisma.EditionOrderByWithRelationInput;

function buildEditionOrderBy(sort: string): EditionOrderBy {
  switch (sort) {
    case "title-desc":
      return { work: { sortTitle: { sort: "desc", nulls: "last" } } };
    case "publisher-asc":
      return { publisher: "asc" };
    case "publisher-desc":
      return { publisher: "desc" };
    case "publishDate-asc":
      return { publishedAt: "asc" };
    case "publishDate-desc":
      return { publishedAt: "desc" };
    case "pageCount-asc":
      return { pageCount: "asc" };
    case "pageCount-desc":
      return { pageCount: "desc" };
    case "duration-asc":
      return { duration: "asc" };
    case "duration-desc":
      return { duration: "desc" };
    case "format-asc":
      return { formatFamily: "asc" };
    case "format-desc":
      return { formatFamily: "desc" };
    case "isbn13-asc":
      return { isbn13: "asc" };
    case "isbn13-desc":
      return { isbn13: "desc" };
    case "isbn10-asc":
      return { isbn10: "asc" };
    case "isbn10-desc":
      return { isbn10: "desc" };
    case "asin-asc":
      return { asin: "asc" };
    case "asin-desc":
      return { asin: "desc" };
    case "recent":
      return { createdAt: "desc" };
    default:
      return { work: { sortTitle: { sort: "asc", nulls: "last" } } };
  }
}

const EDITION_CONTRIBUTOR_SORT_OPTIONS = new Set([
  "author-asc", "author-desc",
  "narrator-asc", "narrator-desc",
]);

const EDITION_CONTRIBUTOR_SORT_SELECT = {
  id: true,
  contributors: {
    select: { contributor: { select: { nameSort: true, nameCanonical: true } } },
  },
} as const;

type LightweightEditionContributor = {
  id: string;
  contributors: { contributor: { nameSort: string | null; nameCanonical: string } }[];
};

type EditionContributorSortOption = "author-asc" | "author-desc" | "narrator-asc" | "narrator-desc";

function extractEditionContributorSortKey(edition: LightweightEditionContributor): string {
  return edition.contributors
    .map((c) => c.contributor.nameSort ?? c.contributor.nameCanonical)
    .sort()[0] ?? "\uffff";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client's findMany has complex generics
type EditionFindMany = (args: any) => Promise<any[]>;
type EditionDbClient = { edition: { findMany: EditionFindMany } };

async function fetchEditionsWithContributorSort(
  db: EditionDbClient,
  where: Prisma.EditionWhereInput,
  page: number,
  pageSize: number,
  sort: EditionContributorSortOption,
) {
  const direction = sort.endsWith("-desc") ? "desc" : "asc";
  const role = sort.startsWith("narrator") ? "NARRATOR" as const : "AUTHOR" as const;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Prisma select narrows the type at runtime
  const allEditions: LightweightEditionContributor[] = await db.edition.findMany({
    where,
    select: {
      ...EDITION_CONTRIBUTOR_SORT_SELECT,
      contributors: {
        ...EDITION_CONTRIBUTOR_SORT_SELECT.contributors,
        where: { role },
      },
    },
  });

  const sorted = allEditions
    .map((e) => ({ id: e.id, key: extractEditionContributorSortKey(e) }))
    .sort((a, b) =>
      direction === "asc"
        ? a.key.localeCompare(b.key)
        : b.key.localeCompare(a.key),
    );

  const pageIds = sorted
    .slice((page - 1) * pageSize, page * pageSize)
    .map((e) => e.id);

  if (pageIds.length === 0) return [] as Prisma.EditionGetPayload<{ include: typeof EDITION_VIEW_INCLUDE }>[];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Prisma include narrows the type at runtime
  const fullEditions: Prisma.EditionGetPayload<{ include: typeof EDITION_VIEW_INCLUDE }>[] = await db.edition.findMany({
    where: { id: { in: pageIds } },
    include: EDITION_VIEW_INCLUDE,
  });

  const byId = Object.fromEntries(fullEditions.map((e) => [e.id, e]));
  return pageIds.map((id) => byId[id]).filter(Boolean) as typeof fullEditions;
}

export const getFilteredLibraryEditionsServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(filterSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const parsed = filterSchema.parse(data);
    const where = buildEditionWhere(parsed);

    const editionsPromise = EDITION_CONTRIBUTOR_SORT_OPTIONS.has(parsed.sort)
      ? fetchEditionsWithContributorSort(
          db,
          where,
          parsed.page,
          parsed.pageSize,
          parsed.sort as EditionContributorSortOption,
        )
      : db.edition.findMany({
          where,
          orderBy: buildEditionOrderBy(parsed.sort),
          skip: (parsed.page - 1) * parsed.pageSize,
          take: parsed.pageSize,
          include: EDITION_VIEW_INCLUDE,
        });

    const [editions, totalCount] = await Promise.all([
      editionsPromise,
      db.edition.count({ where }),
    ]);

    return { editions, totalCount };
  });

export type LibraryEdition = Awaited<
  ReturnType<typeof getFilteredLibraryEditionsServerFn>
>["editions"][number];

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
