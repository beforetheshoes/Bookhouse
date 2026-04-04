import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps } from "../auth-helper";

const CONTENT_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";

export interface AuthorListHandlerDeps {
  auth: OpdsAuthDeps;
  getAuthors: () => Promise<Array<{
    id: string;
    nameDisplay: string;
    editionCount: number;
    updatedAt: Date;
  }>>;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createAuthorListHandler(deps: AuthorListHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("../auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const authors = await deps.getAuthors();

    const { buildNavigationFeed } = await import("@bookhouse/opds");

    const baseUrl = deps.getBaseUrl();

    const xml = buildNavigationFeed({
      id: "urn:bookhouse:authors",
      title: "Authors",
      updatedAt: authors[0]?.updatedAt ?? new Date(),
      baseUrl,
      selfHref: "/opds/authors",
      items: authors.map((author) => ({
        title: author.nameDisplay,
        href: `/opds/authors/${author.id}`,
        count: author.editionCount,
        updatedAt: author.updatedAt,
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

  const handler = createAuthorListHandler({
    auth: {
      findCredentialByUsername: (username) =>
        db.opdsCredential.findUnique({ where: { username } }),
      verifyPassword,
    },
    getAuthors: async () => {
      const contributors = await db.contributor.findMany({
        where: {
          editions: {
            some: {
              role: "AUTHOR",
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
          },
        },
        include: {
          _count: {
            select: {
              editions: {
                where: {
                  role: "AUTHOR",
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
              },
            },
          },
        },
        orderBy: { nameDisplay: "asc" },
      });
      return contributors.map((c) => ({
        id: c.id,
        nameDisplay: c.nameDisplay,
        editionCount: c._count.editions,
        updatedAt: c.createdAt,
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
