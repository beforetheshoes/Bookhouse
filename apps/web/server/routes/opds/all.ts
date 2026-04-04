import { defineEventHandler, getQuery, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps } from "./auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const PAGE_SIZE = 25;

export interface AllBooksHandlerDeps {
  auth: OpdsAuthDeps;
  getEditions: (options: { skip: number; take: number }) => Promise<OpdsEditionData[]>;
  countEditions: () => Promise<number>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createAllBooksHandler(deps: AllBooksHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("./auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const query = getQuery(event);
    const pageParam = typeof query.page === "string" ? parseInt(query.page, 10) : 1;
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;

    const skip = (page - 1) * PAGE_SIZE;
    const [entries, total] = await Promise.all([
      deps.getEditions({ skip, take: PAGE_SIZE }),
      deps.countEditions(),
    ]);

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();
    const hasNext = skip + entries.length < total;
    const hasPrevious = page > 1;

    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:all",
      title: "All Books",
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: "/opds/all",
      entries,
      searchHref: "/opds/opensearch.xml",
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

  const handler = createAllBooksHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getEditions: async ({ skip, take }) => {
      const editions = await db.edition.findMany({
        where: {
          formatFamily: "EBOOK",
          editionFiles: {
            some: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT" },
            },
          },
        },
        include: {
          work: { include: { series: true } },
          contributors: { include: { contributor: true } },
          editionFiles: {
            where: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT" },
            },
            include: { fileAsset: true },
          },
        },
        orderBy: { work: { sortTitle: "asc" } },
        skip,
        take,
      });
      return editions.map(mapEditionToOpds);
    },
    countEditions: () =>
      db.edition.count({
        where: {
          formatFamily: "EBOOK",
          editionFiles: {
            some: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT" },
            },
          },
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
