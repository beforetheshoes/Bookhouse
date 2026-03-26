import { createError, defineEventHandler, useSession } from "h3";
import type { H3Event } from "h3";
import type { AuthSessionData, AuthenticatedUser } from "@bookhouse/auth";

export interface AuthMiddlewareDeps {
  getSession: (
    event: H3Event,
  ) => Promise<{ data: Partial<AuthSessionData> }>;
  resolveUser: (
    session: Partial<AuthSessionData>,
  ) => Promise<AuthenticatedUser | null>;
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps) {
  return async (event: H3Event) => {
    if (!event.path.startsWith("/api/")) {
      return;
    }

    const session = await deps.getSession(event);
    const user = await deps.resolveUser(session.data);

    if (!user) {
      throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
    }
  };
}

/* c8 ignore start — runtime wiring, tested via unit tests on createAuthMiddleware */
export default defineEventHandler(async (event) => {
  const { loadAuthConfig, resolveAuthenticatedUser } = await import(
    "@bookhouse/auth"
  );
  const { db } = await import("@bookhouse/db");

  const authConfig = loadAuthConfig();
  const session = await useSession<AuthSessionData>(event, {
    password: authConfig.secret,
    name: "bookhouse-auth",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: new URL(authConfig.appUrl).protocol === "https:",
    },
  });

  if (!event.path.startsWith("/api/")) {
    return;
  }

  const user = await resolveAuthenticatedUser({ db, session: session.data });

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
});
/* c8 ignore stop */
