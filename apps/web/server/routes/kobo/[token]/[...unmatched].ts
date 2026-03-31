import { defineEventHandler, setResponseHeader } from "h3";

/* c8 ignore start — catch-all for unhandled Kobo requests */
export default defineEventHandler((event) => {
  const params = event.context.params as Record<string, string>;
  const unmatched = params.unmatched ?? "";
  console.log(`[kobo] UNHANDLED ${event.method} /kobo/${params.token}/${unmatched}`);

  setResponseHeader(event, "x-kobo-apitoken", "e30=");

  return {};
});
/* c8 ignore stop */
