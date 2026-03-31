import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import { makeOauthResponse } from "./authorize";

export function createOauthTokenHandler() {
  return (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const token = params.token as string;

    return makeOauthResponse(token);
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler((event) => {
  const handler = createOauthTokenHandler();
  return handler(event);
});
/* c8 ignore stop */
