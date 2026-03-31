import { defineEventHandler } from "h3";
import { createOidcDiscoveryHandler } from "../../../[token]/.well-known/openid-configuration";

/* c8 ignore start — runtime wiring, reuses createOidcDiscoveryHandler */
export default defineEventHandler((event) => {
  const handler = createOidcDiscoveryHandler({
    getBaseUrl: () => process.env.KOBO_API_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000",
  });
  return handler(event);
});
/* c8 ignore stop */
