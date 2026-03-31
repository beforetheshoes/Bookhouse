import { defineEventHandler } from "h3";
import type { H3Event } from "h3";

export interface OidcDiscoveryDeps {
  getBaseUrl: () => string;
}

export function createOidcDiscoveryHandler(deps: OidcDiscoveryDeps) {
  return (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const token = params.token as string;
    const baseUrl = deps.getBaseUrl();
    const prefix = `${baseUrl}/kobo/${token}/oauth`;

    return {
      issuer: prefix,
      authorization_endpoint: `${prefix}/authorize`,
      token_endpoint: `${prefix}/token`,
      userinfo_endpoint: `${prefix}/userinfo`,
      end_session_endpoint: `${prefix}/logout`,
    };
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler((event) => {
  const handler = createOidcDiscoveryHandler({
    getBaseUrl: () => process.env.KOBO_API_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000",
  });
  return handler(event);
});
/* c8 ignore stop */
