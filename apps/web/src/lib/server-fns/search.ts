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

const searchSchema = z.object({
  query: z.string(),
});

export const searchLibraryServerFn = createServerFn({
  method: "GET",
})
  .inputValidator(searchSchema)
  .handler(async ({ data }) => {
    const trimmed = data.query.trim();

    if (!trimmed) {
      return { works: [], authors: [], series: [] };
    }

    const { db } = await import("@bookhouse/db");

    const [titleWorks, authors, series, isbnEditions] = await Promise.all([
      db.work.findMany({
        where: {
          OR: [
            { titleDisplay: { contains: trimmed, mode: "insensitive" } },
            { titleCanonical: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        take: 5,
        include: WORK_INCLUDE,
      }),
      db.contributor.findMany({
        where: {
          nameDisplay: { contains: trimmed, mode: "insensitive" },
        },
        take: 5,
      }),
      db.series.findMany({
        where: {
          name: { contains: trimmed, mode: "insensitive" },
        },
        take: 5,
      }),
      db.edition.findMany({
        where: {
          OR: [
            { isbn13: { contains: trimmed, mode: "insensitive" } },
            { isbn10: { contains: trimmed, mode: "insensitive" } },
            { asin: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        take: 5,
        include: {
          work: { include: WORK_INCLUDE },
        },
      }),
    ]);

    // Merge works from title search and ISBN search, deduplicating
    const seenWorkIds = new Set(titleWorks.map((w) => w.id));
    const allWorks = [...titleWorks];
    for (const edition of isbnEditions) {
      if (!seenWorkIds.has(edition.work.id)) {
        seenWorkIds.add(edition.work.id);
        allWorks.push(edition.work);
      }
    }

    return { works: allWorks, authors, series };
  });

export type SearchResult = Awaited<ReturnType<typeof searchLibraryServerFn>>;
