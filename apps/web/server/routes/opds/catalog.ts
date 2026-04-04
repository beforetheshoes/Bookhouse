import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps } from "./auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";

export interface CatalogHandlerDeps {
  auth: OpdsAuthDeps;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createCatalogHandler(deps: CatalogHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("./auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const { buildNavigationFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();
    const now = new Date();

    const xml = buildNavigationFeed({
      id: "urn:bookhouse:catalog",
      title: "Bookhouse",
      updatedAt: now,
      baseUrl,
      selfHref: "/opds/catalog",
      searchHref: "/opds/opensearch.xml",
      items: [
        { title: "All Books", href: "/opds/all", updatedAt: now },
        { title: "Recently Added", href: "/opds/recent", updatedAt: now },
        { title: "Authors", href: "/opds/authors", updatedAt: now },
        { title: "Series", href: "/opds/series", updatedAt: now },
        { title: "My Shelves", href: "/opds/shelves", updatedAt: now },
        { title: "Publishers", href: "/opds/publishers", updatedAt: now },
      ],
    });

    deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
    return xml;
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");

  const handler = createCatalogHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getBaseUrl: () => process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
