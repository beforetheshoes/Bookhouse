import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps, OpdsAuthResult } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";

export interface ShelfListHandlerDeps {
  auth: OpdsAuthDeps;
  getShelves: (userId: string) => Promise<Array<{
    id: string;
    name: string;
    itemCount: number;
    updatedAt: Date;
  }>>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createShelfListHandler(deps: ShelfListHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    const authResult: OpdsAuthResult = await auth(event);

    const shelves = await deps.getShelves(authResult.userId);

    const { buildNavigationFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildNavigationFeed({
      id: "urn:bookhouse:shelves",
      title: "My Shelves",
      updatedAt: shelves[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: "/opds/shelves",
      items: shelves.map((shelf) => ({
        title: shelf.name,
        href: `/opds/shelves/${shelf.id}`,
        count: shelf.itemCount,
        updatedAt: shelf.updatedAt,
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

  const handler = createShelfListHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getShelves: async (userId) => {
      const collections = await db.collection.findMany({
        where: { ownerUserId: userId },
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { name: "asc" },
      });
      return collections.map((c) => ({
        id: c.id,
        name: c.name,
        itemCount: c._count.items,
        updatedAt: new Date(),
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
