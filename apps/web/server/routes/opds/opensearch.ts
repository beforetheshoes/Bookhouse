import { defineEventHandler, setResponseHeader as h3SetResponseHeader } from "h3";
import type { H3Event } from "h3";

const CONTENT_TYPE = "application/opensearchdescription+xml";

export interface OpenSearchHandlerDeps {
  getBaseUrl: () => string;
  setResponseHeader: (event: H3Event, name: string, value: string) => void;
}

export function createOpenSearchHandler(deps: OpenSearchHandlerDeps) {
  return async (event: H3Event) => {
    const { buildOpenSearchDescriptor } = await import("@bookhouse/opds");
    const baseUrl = deps.getBaseUrl();

    deps.setResponseHeader(event, "Content-Type", CONTENT_TYPE);
    return buildOpenSearchDescriptor(baseUrl);
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const handler = createOpenSearchHandler({
    getBaseUrl: () => process.env.APP_URL ?? "http://localhost:3000",
    setResponseHeader: (e, name, value) => {
      h3SetResponseHeader(e, name, value);
    },
  });

  return handler(event);
});
/* c8 ignore stop */
