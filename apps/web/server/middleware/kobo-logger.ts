import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import { redactKoboToken } from "../utils/kobo-path";

export function createKoboLogger(log: (line: string) => void) {
  return (event: H3Event) => {
    if (event.url.pathname.startsWith("/kobo/")) {
      log(`[kobo] ${event.req.method} ${redactKoboToken(event.url.pathname)}`);
    }
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createKoboLogger */
export default defineEventHandler(
  createKoboLogger((line) => {
    console.log(line);
  }),
);
/* c8 ignore stop */
