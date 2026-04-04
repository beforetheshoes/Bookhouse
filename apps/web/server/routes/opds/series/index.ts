import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";

export interface SeriesListHandlerDeps {
  auth: OpdsAuthDeps;
  getSeries: () => Promise<Array<{
    id: string;
    name: string;
    workCount: number;
    updatedAt: Date;
  }>>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createSeriesListHandler(deps: SeriesListHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const series = await deps.getSeries();

    const { buildNavigationFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildNavigationFeed({
      id: "urn:bookhouse:series",
      title: "Series",
      updatedAt: series[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: "/opds/series",
      items: series.map((s) => ({
        title: s.name,
        href: `/opds/series/${s.id}`,
        count: s.workCount,
        updatedAt: s.updatedAt,
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

  const handler = createSeriesListHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getSeries: async () => {
      const rows = await db.series.findMany({
        where: {
          works: {
            some: {
              editions: {
                some: {
                  formatFamily: "EBOOK",
                  editionFiles: {
                    some: {
                      role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
                      fileAsset: { availabilityStatus: "PRESENT", mediaKind: "EPUB" },
                    },
                  },
                },
              },
            },
          },
        },
        include: {
          _count: { select: { works: true } },
          works: {
            select: { updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        workCount: r._count.works,
        updatedAt: r.works[0]?.updatedAt ?? new Date(),
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
