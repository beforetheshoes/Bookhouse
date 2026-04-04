import { defineEventHandler, createError, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

export interface PublisherBooksHandlerDeps {
  auth: OpdsAuthDeps;
  getPublisherEditions: (publisher: string) => Promise<OpdsEditionData[]>;
  publisherExists: (publisher: string) => Promise<boolean>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createPublisherBooksHandler(deps: PublisherBooksHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const params = event.context.params as { publisher: string };
    const publisher = decodeURIComponent(params.publisher);

    const exists = await deps.publisherExists(publisher);
    if (!exists) {
      throw createError({ statusCode: 404, statusMessage: "Publisher not found" });
    }

    const entries = await deps.getPublisherEditions(publisher);

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildAcquisitionFeed({
      id: `urn:bookhouse:publisher:${encodeURIComponent(publisher)}`,
      title: publisher,
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: `/opds/publishers/${encodeURIComponent(publisher)}`,
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

  const handler = createPublisherBooksHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    publisherExists: async (publisher) => {
      const count = await db.edition.count({
        where: {
          publisher,
          formatFamily: "EBOOK",
          editionFiles: {
            some: {
              role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
              fileAsset: { availabilityStatus: "PRESENT" },
            },
          },
        },
      });
      return count > 0;
    },
    getPublisherEditions: async (publisher) => {
      const editions = await db.edition.findMany({
        where: {
          publisher,
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
