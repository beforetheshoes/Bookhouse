import { defineEventHandler } from "h3";
import type { H3Event } from "h3";
import type { KoreaderAuthResult } from "../auth-helper";

export interface KoreaderUserAuthDeps {
  auth: (event: H3Event) => Promise<KoreaderAuthResult>;
}

export function createKoreaderUserAuthHandler(deps: KoreaderUserAuthDeps) {
  return async (event: H3Event) => {
    await deps.auth(event);
    return { authorized: "OK" };
  };
}

export default defineEventHandler(async (event) => {
  const { db } = await import("@bookhouse/db");
  const { verifyPassword } = await import("@bookhouse/opds");
  const { createKoreaderAuth } = await import("../auth-helper");

  const handler = createKoreaderUserAuthHandler({
    auth: createKoreaderAuth({
      findCredentialByUsername: (username) =>
        db.koreaderCredential.findUnique({ where: { username } }),
      verifyPassword,
    }),
  });

  return handler(event);
});
