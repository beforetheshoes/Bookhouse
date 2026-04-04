import { defineEventHandler, getQuery, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps } from "./auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const PAGE_SIZE = 25;

export interface SearchHandlerDeps {
  auth: OpdsAuthDeps;
  searchEditions: (query: string, options: { skip: number; take: number }) => Promise<OpdsEditionData[]>;
  countSearchResults: (query: string) => Promise<number>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createSearchHandler(deps: SearchHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("./auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const query = getQuery(event);
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const pageParam = typeof query.page === "string" ? parseInt(query.page, 10) : 1;
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");
    const baseUrl = deps.getBaseUrl();

    if (!q) {
      const xml = buildAcquisitionFeed({
        id: "urn:bookhouse:search",
        title: "Search Results",
        updatedAt: new Date(),
        baseUrl,
        selfHref: "/opds/search",
        entries: [],
      });
      deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
      return xml;
    }

    const skip = (page - 1) * PAGE_SIZE;
    const [entries, total] = await Promise.all([
      deps.searchEditions(q, { skip, take: PAGE_SIZE }),
      deps.countSearchResults(q),
    ]);

    const hasNext = skip + entries.length < total;
    const hasPrevious = page > 1;

    const xml = buildAcquisitionFeed({
      id: `urn:bookhouse:search:${encodeURIComponent(q)}`,
      title: `Search: ${q}`,
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: `/opds/search?q=${encodeURIComponent(q)}`,
      entries,
      pagination: {
        page,
        perPage: PAGE_SIZE,
        totalResults: total,
        hasNext,
        hasPrevious,
      },
    });

    deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
    return xml;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");
  const { mapEditionToOpds } = await import("./edition-mapper");

  const ebookFilter = {
    formatFamily: "EBOOK" as const,
    editionFiles: {
      some: {
        role: { in: ["PRIMARY" as const, "ALTERNATE_FORMAT" as const] },
        fileAsset: { availabilityStatus: "PRESENT" as const, mediaKind: "EPUB" as const },
      },
    },
  };

  const handler = createSearchHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    searchEditions: async (q, { skip, take }) => {
      const editions = await db.edition.findMany({
        where: {
          ...ebookFilter,
          OR: [
            { work: { titleDisplay: { contains: q, mode: "insensitive" } } },
            {
              contributors: {
                some: {
                  contributor: { nameDisplay: { contains: q, mode: "insensitive" } },
                },
              },
            },
          ],
        },
        include: {
          work: { include: { series: true } },
          contributors: { include: { contributor: true } },
          editionFiles: {
            where: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT", mediaKind: "EPUB" },
            },
            include: { fileAsset: true },
          },
        },
        orderBy: { work: { titleDisplay: "asc" } },
        skip,
        take,
      });
      return editions.map(mapEditionToOpds);
    },
    countSearchResults: (q) =>
      db.edition.count({
        where: {
          ...ebookFilter,
          OR: [
            { work: { titleDisplay: { contains: q, mode: "insensitive" } } },
            {
              contributors: {
                some: {
                  contributor: { nameDisplay: { contains: q, mode: "insensitive" } },
                },
              },
            },
          ],
        },
      }),
    getBaseUrl: () => process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
