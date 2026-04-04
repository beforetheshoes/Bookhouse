import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";
import type { OpdsAuthDeps } from "./auth-helper";

const CONTENT_TYPE = "application/opensearchdescription+xml";

export interface OpenSearchHandlerDeps {
  auth: OpdsAuthDeps;
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createOpenSearchHandler(deps: OpenSearchHandlerDeps) {
  return async (event: H3Event) => {
    const { createOpdsAuth } = await import("./auth-helper");
    const auth = createOpdsAuth(deps.auth);
    await auth(event);

    const { buildOpenSearchDescriptor } = await import("@bookhouse/opds");
    const baseUrl = deps.getBaseUrl();

    deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
    return buildOpenSearchDescriptor(baseUrl);
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");

  const handler = createOpenSearchHandler({
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
