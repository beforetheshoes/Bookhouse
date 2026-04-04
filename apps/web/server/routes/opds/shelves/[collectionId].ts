import { defineEventHandler, createError, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsEditionData } from "@bookhouse/opds";
import type { OpdsAuthDeps, OpdsAuthResult } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

export interface ShelfBooksHandlerDeps {
  auth: OpdsAuthDeps;
  getShelfEditions: (collectionId: string, userId: string) => Promise<OpdsEditionData[]>;
  getShelfName: (collectionId: string, userId: string) => Promise<string | null>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createShelfBooksHandler(deps: ShelfBooksHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    const authResult: OpdsAuthResult = await auth(event);

    const params = event.context.params as { collectionId: string };
    const { collectionId } = params;

    if (!VALID_ID.test(collectionId)) {
      throw createError({ statusCode: 400, statusMessage: "Invalid collectionId" });
    }

    const shelfName = await deps.getShelfName(collectionId, authResult.userId);
    if (!shelfName) {
      throw createError({ statusCode: 404, statusMessage: "Shelf not found" });
    }

    const entries = await deps.getShelfEditions(collectionId, authResult.userId);

    const { buildAcquisitionFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildAcquisitionFeed({
      id: `urn:bookhouse:shelf:${collectionId}`,
      title: shelfName,
      updatedAt: entries[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: `/opds/shelves/${collectionId}`,
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

  const handler = createShelfBooksHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getShelfName: async (collectionId, userId) => {
      const collection = await db.collection.findFirst({
        where: { id: collectionId, ownerUserId: userId },
        select: { name: true },
      });
      return collection?.name ?? null;
    },
    getShelfEditions: async (collectionId, userId) => {
      const items = await db.collectionItem.findMany({
        where: {
          collectionId,
          collection: { ownerUserId: userId },
          edition: {
            formatFamily: "EBOOK",
            editionFiles: {
              some: {
                role: { in: ["PRIMARY", "ALTERNATE_FORMAT"] },
                fileAsset: { availabilityStatus: "PRESENT", mediaKind: "EPUB" },
              },
            },
          },
        },
        include: {
          edition: {
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
          },
        },
      });
      return items.map((item) => mapEditionToOpds(item.edition));
    },
    getBaseUrl: () => process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
