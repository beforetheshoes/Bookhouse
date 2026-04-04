import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps } from "./auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const RECENT_LIMIT = 50;

export interface RecentHandlerDeps {
  auth: OpdsAuthDeps;
  getRecentEditions: (limit: number) => Promise<OpdsEditionData[]>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createRecentHandler(deps: RecentHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("./auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const entries = await deps.getRecentEditions(RECENT_LIMIT);

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildAcquisitionFeed({
      id: "urn:bookhouse:recent",
      title: "Recently Added",
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: "/opds/recent",
      entries,
      searchHref: "/opds/opensearch.xml",
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

  const handler = createRecentHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getRecentEditions: async (limit) => {
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
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return editions.map(mapEditionToOpds);
    },
    getBaseUrl: () => process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
