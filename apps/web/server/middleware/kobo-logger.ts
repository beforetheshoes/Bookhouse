import { defineEventHandler } from "h3";

export default defineEventHandler((event) => {
  if (event.path.startsWith("/kobo/")) {
    console.log(`[kobo] ${event.method} ${event.path}`);
  }
});
