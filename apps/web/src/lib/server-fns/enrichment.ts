import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SearchSourcesDeps, RateLimitResult } from "@bookhouse/ingest";

interface SearchFns {
  searchOpenLibrary: (title: string, author: string | undefined, fetcher: typeof fetch) => Promise<unknown>;
  getOpenLibraryWork: (olid: string, fetcher: typeof fetch) => Promise<unknown>;
  getOpenLibraryEdition: (isbn: string, fetcher: typeof fetch) => Promise<unknown>;
  searchGoogleBooks: (title: string, author: string | undefined, apiKey: string, fetcher: typeof fetch) => Promise<unknown>;
  searchHardcover: (title: string, author: string | undefined, apiKey: string, fetcher: typeof fetch) => Promise<unknown>;
}

export function buildSearchDeps(
  gbKey: string | null,
  hcKey: string | null,
  rateLimiter: { check: () => RateLimitResult },
  fetcher: typeof fetch,
  fns: SearchFns,
): SearchSourcesDeps {
  return {
    searchOL: (title, a) => fns.searchOpenLibrary(title, a, fetcher) as ReturnType<SearchSourcesDeps["searchOL"]>,
    getOLWork: (olid) => fns.getOpenLibraryWork(olid, fetcher) as ReturnType<SearchSourcesDeps["getOLWork"]>,
    getOLEdition: (isbn) => fns.getOpenLibraryEdition(isbn, fetcher) as ReturnType<SearchSourcesDeps["getOLEdition"]>,
    searchGB: gbKey
      ? (title, a) => fns.searchGoogleBooks(title, a, gbKey, fetcher) as ReturnType<SearchSourcesDeps["searchGB"]>
      : () => Promise.resolve(null),
    searchHC: hcKey
      ? (title, a) => fns.searchHardcover(title, a, hcKey, fetcher) as ReturnType<SearchSourcesDeps["searchHC"]>
      : () => Promise.resolve(null),
    checkRateLimit: () => rateLimiter.check(),
  };
}

const triggerSchema = z.object({
  workId: z.string(),
});

export const triggerEnrichmentServerFn = createServerFn({
  method: "POST",
})
  .inputValidator(triggerSchema)
  .handler(async ({ data }) => {
    const { db } = await import("@bookhouse/db");
    const { enqueueLibraryJob } = await import("@bookhouse/shared");

    const importJob = await db.importJob.create({
      data: {
        kind: "REFRESH_METADATA",
        status: "QUEUED",
        payload: { workId: data.workId },
      },
    });

    const queueJobId = await enqueueLibraryJob("refresh-metadata", {
      workId: data.workId,
      importJobId: importJob.id,
    });

    return { importJobId: importJob.id, queueJobId };
  });

const searchSchema = z.object({
  workId: z.string(),
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
      RateLimiter,
    } = await import("@bookhouse/ingest");
    const { getDecryptedApiKey } = await import("./integrations");

    const work = await db.work.findUnique({
      where: { id: data.workId },
      include: {
        editions: {
          include: { contributors: { include: { contributor: true } } },
          take: 1,
        },
      },
    });

    if (!work) return { status: "not-found" };

    const edition = work.editions[0];
    if (!edition) return { status: "no-editions" };

    const author = edition.contributors.length > 0
      ? edition.contributors[0]?.contributor.nameDisplay
      : undefined;

    const [gbKey, hcKey] = await Promise.all([
      getDecryptedApiKey("googlebooks"),
      getDecryptedApiKey("hardcover"),
    ]);

    const rateLimiter = new RateLimiter();
    const deps = buildSearchDeps(gbKey, hcKey, rateLimiter, fetch, {
      searchOpenLibrary,
      getOpenLibraryWork,
      getOpenLibraryEdition,
      searchGoogleBooks,
      searchHardcover,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return await searchAllSources(work.titleDisplay, author, deps) as any;
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
  workFields: z.record(z.unknown()).optional(),
  editionFields: z.record(z.unknown()).optional(),
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
    }

    // Apply edition-level fields
    if (data.editionId && data.editionFields && Object.keys(data.editionFields).length > 0) {
      const edition = await db.edition.findUnique({
        where: { id: data.editionId },
        select: { editedFields: true },
      });
      const editedFields = edition?.editedFields ?? [];
      const filteredFields = Object.fromEntries(
        Object.entries(data.editionFields).filter(([key]) => !editedFields.includes(key)),
      );

      // Map enrichment field names to Prisma column names
      if ("publishedDate" in filteredFields) {
        const val = filteredFields.publishedDate;
        delete filteredFields.publishedDate;
        filteredFields.publishedAt = val ? new Date(val as string) : null;
      }

      if (Object.keys(filteredFields).length > 0) {
        await db.edition.update({
          where: { id: data.editionId },
          data: filteredFields,
        });
        appliedAnyFields = true;
        allAppliedFields.push(...Object.keys(filteredFields));
      }
    }

    // Create provenance record
    if (appliedAnyFields) {
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
