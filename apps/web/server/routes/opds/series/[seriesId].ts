import { defineEventHandler, getRouterParam, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export interface SeriesBooksHandlerDeps {
  auth: OpdsAuthDeps;
  getSeriesEditions: (seriesId: string) => Promise<OpdsEditionData[]>;
  getSeriesName: (seriesId: string) => Promise<string | null>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createSeriesBooksHandler(deps: SeriesBooksHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const seriesId = getRouterParam(event, "seriesId") ?? "";

    if (!VALID_ID.test(seriesId)) {
      throw Object.assign(new Error("Invalid series ID"), {
        statusCode: 400,
        statusMessage: "Bad Request",
      });
    }

    const seriesName = await deps.getSeriesName(seriesId);

    if (seriesName == null) {
      throw Object.assign(new Error("Series not found"), {
        statusCode: 404,
        statusMessage: "Not Found",
      });
    }

    const entries = await deps.getSeriesEditions(seriesId);

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildAcquisitionFeed({
      id: `urn:bookhouse:series:${seriesId}`,
      title: seriesName,
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: `/opds/series/${seriesId}`,
      entries,
    });

    deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
    return xml;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");
  const { mapEditionToOpds } = await import("../edition-mapper");

  const handler = createSeriesBooksHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getSeriesName: async (seriesId) => {
      const series = await db.series.findUnique({
        where: { id: seriesId },
        select: { name: true },
      });
      return series?.name ?? null;
    },
    getSeriesEditions: async (seriesId) => {
      const editions = await db.edition.findMany({
        where: {
          formatFamily: "EBOOK",
          work: { seriesId },
          editionFiles: {
            some: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT", mediaKind: "EPUB" },
            },
          },
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
        orderBy: { work: { seriesPosition: "asc" } },
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
