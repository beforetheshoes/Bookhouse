import { defineEventHandler, createError, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export interface AuthorBooksHandlerDeps {
  auth: OpdsAuthDeps;
  getAuthorEditions: (contributorId: string) => Promise<OpdsEditionData[]>;
  getAuthorName: (contributorId: string) => Promise<string | null>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createAuthorBooksHandler(deps: AuthorBooksHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const params = event.context.params as { contributorId: string };
    const { contributorId } = params;

    if (!VALID_ID.test(contributorId)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid contributorId" });
    }

    const authorName = await deps.getAuthorName(contributorId);
    if (!authorName) {
      throw createError({ statusCode: 404, statusMessage: "Author not found" });
    }

    const entries = await deps.getAuthorEditions(contributorId);

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildAcquisitionFeed({
      id: `urn:bookhouse:author:${contributorId}`,
      title: authorName,
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: `/opds/authors/${contributorId}`,
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

  const handler = createAuthorBooksHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getAuthorName: async (contributorId) => {
      const contributor = await db.contributor.findUnique({
        where: { id: contributorId },
        select: { nameDisplay: true },
      });
      return contributor?.nameDisplay ?? null;
    },
    getAuthorEditions: async (contributorId) => {
      const editions = await db.edition.findMany({
        where: {
          formatFamily: "EBOOK",
          contributors: {
            some: {
              role: "AUTHOR",
              contributorId,
            },
          },
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
