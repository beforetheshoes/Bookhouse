import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SearchSourcesDeps, RateLimitResult, CoverFromUrlDeps, CoverFromUrlDbDeps, OLSearchResult, OLWork, OLEdition, GBVolume, HCBook, AudibleProduct } from "@bookhouse/ingest";

interface SearchFns {
  searchOpenLibrary: (title: string, author: string | undefined, fetcher: typeof fetch) => Promise<OLSearchResult[] | null>;
  getOpenLibraryWork: (olid: string, fetcher: typeof fetch) => Promise<OLWork | null>;
  getOpenLibraryEdition: (isbn: string, fetcher: typeof fetch) => Promise<OLEdition | null>;
  searchGoogleBooks: (title: string, author: string | undefined, apiKey: string, fetcher: typeof fetch) => Promise<GBVolume[] | null>;
  searchHardcover: (title: string, author: string | undefined, apiKey: string, fetcher: typeof fetch) => Promise<HCBook[] | null>;
  searchAudible: (title: string, author: string | undefined, fetcher: typeof fetch) => Promise<AudibleProduct[] | null>;
  lookupAudibleByAsin: (asin: string, fetcher: typeof fetch) => Promise<AudibleProduct | null>;
}

export function buildSearchDeps(
  gbKey: string | null,
  hcKey: string | null,
  rateLimiter: { check: () => RateLimitResult },
  fetcher: typeof fetch,
  fns: SearchFns,
): SearchSourcesDeps {
  return {
    searchOL: (title, a) => fns.searchOpenLibrary(title, a, fetcher),
    getOLWork: (olid) => fns.getOpenLibraryWork(olid, fetcher),
    getOLEdition: (isbn) => fns.getOpenLibraryEdition(isbn, fetcher),
    searchGB: gbKey
      ? (title, a) => fns.searchGoogleBooks(title, a, gbKey, fetcher)
      : () => Promise.resolve(null),
    searchHC: hcKey
      ? (title, a) => fns.searchHardcover(title, a, hcKey, fetcher)
      : () => Promise.resolve(null),
    searchAudible: (title, a) => fns.searchAudible(title, a, fetcher),
    lookupAudibleByAsin: (asin) => fns.lookupAudibleByAsin(asin, fetcher),
    checkRateLimit: () => rateLimiter.check(),
  };
}

const searchSchema = z.object({
  workId: z.string(),
  editionId: z.string().optional(),
});

export const searchEnrichmentServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(searchSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const {
      searchAllSources,
      searchOpenLibrary,
      getOpenLibraryWork,
      getOpenLibraryEdition,
      searchGoogleBooks,
      searchHardcover,
      searchAudible,
      lookupAudibleByAsin,
      RateLimiter,
    } = await import("@bookhouse/ingest");
    const { getDecryptedApiKey } = await import("./integrations");

    const work = await db.work.findUnique({
      where: { id: data.workId },
      include: {
        editions: {
          include: { contributors: { include: { contributor: true } } },
        },
      },
    });

    if (!work) return { status: "not-found" };

    const edition = work.editions[0];
    if (!edition) return { status: "no-editions" };

    const author = edition.contributors.length > 0
      ? edition.contributors[0]?.contributor.nameDisplay
      : undefined;

    // When a specific edition is targeted, use its ASIN; otherwise find the first ASIN (prioritize audiobook editions)
    const targetEdition = data.editionId
      ? work.editions.find((e: { id: string }) => e.id === data.editionId)
      : undefined;
    const asin = (targetEdition as { asin: string | null } | undefined)?.asin
      ?? work.editions.find((e: { asin: string | null; formatFamily: string }) => e.asin && e.formatFamily === "AUDIOBOOK")?.asin
      ?? work.editions.find((e: { asin: string | null }) => e.asin)?.asin
      ?? undefined;

    const [gbKey, hcKey] = await Promise.all([
      getDecryptedApiKey("googlebooks"),
      getDecryptedApiKey("hardcover"),
    ]);

    const { createOLFetcher } = await import("@bookhouse/ingest");
    const olFetch = createOLFetcher("bookhouse@teamsnail.org");
    const rateLimiter = new RateLimiter();
    const deps = buildSearchDeps(gbKey, hcKey, rateLimiter, olFetch, {
      searchOpenLibrary,
      getOpenLibraryWork,
      getOpenLibraryEdition,
      searchGoogleBooks,
      searchHardcover,
      searchAudible,
      lookupAudibleByAsin,
    });

    return await searchAllSources(work.titleDisplay, author, deps, asin ? { asin } : undefined);
  });

const getSchema = z.object({
  workId: z.string(),
});

export const getEnrichmentDataServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(getSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    const work = await db.work.findUnique({
      where: { id: data.workId },
      include: {
        editions: {
          select: { id: true },
        },
      },
    });

    if (!work) return { externalLinks: [] };

    const editionIds = work.editions.map((e: { id: string }) => e.id);

    const externalLinks = await db.externalLink.findMany({
      where: {
        OR: [
          { workId: data.workId },
          ...(editionIds.length > 0 ? [{ editionId: { in: editionIds } }] : []),
        ],
      },
    });

    return { externalLinks };
  });

const applySchema = z.object({
  workId: z.string(),
  editionId: z.string().optional(),
  workFields: z.record(z.union([z.string(), z.array(z.string()), z.number(), z.null()])).optional(),
  editionFields: z.record(z.union([z.string(), z.array(z.string()), z.number(), z.null()])).optional(),
  source: z.object({
    provider: z.string(),
    externalId: z.string(),
  }),
});

export const applyEnrichmentServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(applySchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");

    let appliedAnyFields = false;
    const allAppliedFields: string[] = [];

    // Apply work-level fields
    if (data.workFields && Object.keys(data.workFields).length > 0) {
      const work = await db.work.findUnique({
        where: { id: data.workId },
        select: { editedFields: true },
      });
      const editedFields = work?.editedFields ?? [];
      const filteredFields = Object.fromEntries(
        Object.entries(data.workFields).filter(([key]) => !editedFields.includes(key)),
      );

      // Map enrichment field names to Prisma column names
      if ("title" in filteredFields) {
        filteredFields.titleDisplay = filteredFields.title;
        delete filteredFields.title;
      }
      // Handle authors separately — stored via Contributor + EditionContributor
      const authors = filteredFields.authors as string[] | undefined;
      delete filteredFields.authors;
      // Handle subjects/tags separately — not a direct column on Work
      const subjects = filteredFields.subjects as string[] | undefined;
      delete filteredFields.subjects;
      // Strip coverUrl — not a direct column (would require download + processing)
      delete filteredFields.coverUrl;

      if (Object.keys(filteredFields).length > 0) {
        await db.work.update({
          where: { id: data.workId },
          data: filteredFields,
        });
        appliedAnyFields = true;
        allAppliedFields.push(...Object.keys(filteredFields));
      }

      // Apply subjects as tags
      if (subjects && subjects.length > 0) {
        const tagIds: string[] = [];
        for (const tagName of subjects) {
          const trimmed = tagName.trim();
          if (trimmed === "") continue;
          const canonical = trimmed.toLowerCase();
          const existing = await db.tag.findFirst({ where: { nameCanonical: canonical } });
          if (existing) {
            tagIds.push(existing.id);
          } else {
            const created = await db.tag.create({ data: { name: trimmed, nameCanonical: canonical } });
            tagIds.push(created.id);
          }
        }
        // Add new tags without removing existing ones
        for (const tagId of tagIds) {
          await db.workTag.upsert({
            where: { workId_tagId: { workId: data.workId, tagId } },
            create: { workId: data.workId, tagId },
            update: {},
          });
        }
        appliedAnyFields = true;
        allAppliedFields.push("subjects");
      }

      // Apply authors via Contributor + EditionContributor
      if (authors && authors.length > 0) {
        const { canonicalizeContributorName } = await import("@bookhouse/ingest");

        const editions = await db.edition.findMany({
          where: { workId: data.workId },
          select: { id: true },
        });
        const editionIds = editions.map((e: { id: string }) => e.id);

        const contributorIds: string[] = [];
        for (const authorName of authors) {
          const trimmed = authorName.trim();
          if (trimmed === "") continue;
          const canonical = canonicalizeContributorName(trimmed) ?? trimmed.toLowerCase();
          const existing = await db.contributor.findFirst({ where: { nameCanonical: canonical } });
          if (existing) {
            contributorIds.push(existing.id);
          } else {
            const created = await db.contributor.create({
              data: { nameDisplay: trimmed, nameCanonical: canonical },
            });
            contributorIds.push(created.id);
          }
        }

        // Replace AUTHOR contributors on all editions
        await db.editionContributor.deleteMany({
          where: { editionId: { in: editionIds }, role: "AUTHOR" },
        });
        const createData = editionIds.flatMap((editionId: string) =>
          contributorIds.map((contributorId) => ({
            editionId,
            contributorId,
            role: "AUTHOR" as const,
          })),
        );
        await db.editionContributor.createMany({ data: createData, skipDuplicates: true });

        appliedAnyFields = true;
        allAppliedFields.push("authors");
      }
    }

    // Apply edition-level fields
    if (data.editionId && data.editionFields && Object.keys(data.editionFields).length > 0) {
      const edition = await db.edition.findUnique({
        where: { id: data.editionId },
        select: { editedFields: true },
      });
      const editedFields = edition?.editedFields ?? [];
      const filteredFields: Record<string, string | string[] | number | Date | null> = Object.fromEntries(
        Object.entries(data.editionFields).filter(([key]) => !editedFields.includes(key)),
      );

      // Map enrichment field names to Prisma column names
      if ("publishedDate" in filteredFields) {
        const val = filteredFields.publishedDate as string | null;
        delete filteredFields.publishedDate;
        filteredFields.publishedAt = val ? new Date(val) : null;
      }

      // Handle narrators separately — stored via Contributor + EditionContributor (per-edition only)
      const narrators = filteredFields.narrators as string[] | undefined;
      delete filteredFields.narrators;

      if (Object.keys(filteredFields).length > 0) {
        await db.edition.update({
          where: { id: data.editionId },
          data: filteredFields,
        });
        appliedAnyFields = true;
        allAppliedFields.push(...Object.keys(filteredFields));
      }

      // Apply narrators via Contributor + EditionContributor (scoped to this edition only)
      if (narrators && narrators.length > 0) {
        const { canonicalizeContributorName } = await import("@bookhouse/ingest");

        const contributorIds: string[] = [];
        for (const narratorName of narrators) {
          const trimmed = narratorName.trim();
          if (trimmed === "") continue;
          const canonical = canonicalizeContributorName(trimmed) ?? trimmed.toLowerCase();
          const existing = await db.contributor.findFirst({ where: { nameCanonical: canonical } });
          if (existing) {
            contributorIds.push(existing.id);
          } else {
            const created = await db.contributor.create({
              data: { nameDisplay: trimmed, nameCanonical: canonical },
            });
            contributorIds.push(created.id);
          }
        }

        // Replace NARRATOR contributors on this edition only
        await db.editionContributor.deleteMany({
          where: { editionId: data.editionId, role: "NARRATOR" },
        });
        const createData = contributorIds.map((contributorId) => ({
          editionId: data.editionId as string,
          contributorId,
          role: "NARRATOR" as const,
        }));
        await db.editionContributor.createMany({ data: createData, skipDuplicates: true });

        appliedAnyFields = true;
        allAppliedFields.push("narrators");
      }
    }

    // Mark work as enriched and create provenance record
    if (appliedAnyFields) {
      await db.work.update({
        where: { id: data.workId },
        data: { enrichmentStatus: "ENRICHED" },
      });

      // Work-level provenance
      await db.externalLink.upsert({
        where: {
          workId_provider_externalId: {
            workId: data.workId,
            provider: data.source.provider,
            externalId: data.source.externalId,
          },
        },
        create: {
          workId: data.workId,
          provider: data.source.provider,
          externalId: data.source.externalId,
          appliedAt: new Date(),
          appliedFields: allAppliedFields,
        },
        update: {
          appliedAt: new Date(),
          appliedFields: allAppliedFields,
        },
      });
    }

    if (!appliedAnyFields) {
      return { success: true, skippedAll: true };
    }

    return { success: true };
  });

const coverUrlSchema = z.object({
  workId: z.string(),
  imageUrl: z.string().url(),
  source: z.object({
    provider: z.string(),
    externalId: z.string(),
  }).optional(),
});

export const applyCoverFromUrlServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(coverUrlSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { applyCoverFromUrl } = await import("@bookhouse/ingest");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const sharpModule = await import("sharp");
    const { resizeCoverImage, extractDominantColors } = await import("@bookhouse/ingest");

    const coverCacheDir = process.env.COVER_CACHE_DIR ?? "/data/covers";

    /* c8 ignore start — runtime wiring, tested via unit tests on applyCoverFromUrl */
    const deps: CoverFromUrlDeps = {
      fetchUrl: async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch image: ${String(res.status)}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type");
        return { buffer, contentType };
      },
      resizeAndSave: async (imageBuffer, outputDir) => {
        await resizeCoverImage(
          { imageBuffer, outputDir },
          { sharp: sharpModule.default as never, mkdir, writeFile },
        );
      },
      extractColors: (buf) => extractDominantColors(buf, sharpModule.default as never),
    };

    const dbDeps: CoverFromUrlDbDeps = {
      findWork: (id) => db.work.findUnique({ where: { id }, select: { editedFields: true } }),
      updateWork: async (id, updateData) => { await db.work.update({ where: { id }, data: updateData }); },
    };
    /* c8 ignore stop */

    const result = await applyCoverFromUrl({ workId: data.workId, imageUrl: data.imageUrl, coverCacheDir }, deps, dbDeps);

    // Create provenance record if source is provided
    if (data.source) {
      await db.externalLink.upsert({
        where: {
          workId_provider_externalId: {
            workId: data.workId,
            provider: data.source.provider,
            externalId: data.source.externalId,
          },
        },
        create: {
          workId: data.workId,
          provider: data.source.provider,
          externalId: data.source.externalId,
          appliedAt: new Date(),
          appliedFields: ["coverPath"],
        },
        update: {
          appliedAt: new Date(),
          appliedFields: ["coverPath"],
        },
      });
    }

    return result;
  });
