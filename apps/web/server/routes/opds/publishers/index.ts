import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";

export interface PublisherListHandlerDeps {
  auth: OpdsAuthDeps;
  getPublishers: () => Promise<Array<{
    name: string;
    editionCount: number;
    updatedAt: Date;
  }>>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createPublisherListHandler(deps: PublisherListHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const publishers = await deps.getPublishers();

    const { buildNavigationFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildNavigationFeed({
      id: "urn:bookhouse:publishers",
      title: "Publishers",
      updatedAt: publishers[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: "/opds/publishers",
      items: publishers.map((pub) => ({
        title: pub.name,
        href: `/opds/publishers/${encodeURIComponent(pub.name)}`,
        count: pub.editionCount,
        updatedAt: pub.updatedAt,
      })),
    });

    deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
    return xml;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");

  const handler = createPublisherListHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getPublishers: async () => {
      const results = await db.edition.groupBy({
        by: ["publisher"],
        where: {
          publisher: { not: null },
          formatFamily: "EBOOK",
          editionFiles: {
            some: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT" },
            },
          },
        },
        _count: { id: true },
        _max: { updatedAt: true },
        orderBy: { publisher: "asc" },
      });
      return results
        .filter((r): r is typeof r & { publisher: string } => r.publisher !== null)
        .map((r) => ({
          name: r.publisher,
          editionCount: r._count.id,
          updatedAt: r._max.updatedAt ?? new Date(),
        }));
    },
    getBaseUrl: () => process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
