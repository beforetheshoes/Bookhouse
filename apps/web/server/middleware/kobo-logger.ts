import { defineEventHandler } from "h3";

export default defineEventHandler((event) => {
  if (event.url.pathname.startsWith("/kobo/")) {
    console.log(`[kobo] ${event.req.method} ${event.url.pathname}`);
  }
});
