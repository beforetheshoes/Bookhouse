import { HTTPError, defineEventHandler, useSession } from "h3";
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

// KOReader's kosync plugin authenticates every request with its own
// x-auth-user / x-auth-key headers and never carries the browser session
// cookie, so its routes verify credentials themselves (createKoreaderAuth)
// and must not be gated on a session here.
const SESSION_EXEMPT_PREFIXES = ["/api/koreader/"];

function requiresSessionAuth(path: string): boolean {
  if (SESSION_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return path.startsWith("/api/") || path.startsWith("/_serverFn/");
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps) {
  return async (event: H3Event) => {
    if (!requiresSessionAuth(event.url.pathname)) {
      return;
    }

    const session = await deps.getSession(event);
    const user = await deps.resolveUser(session.data);

    if (!user) {
      throw new HTTPError({ status: 401, statusText: "Unauthorized" });
    }

    (event.context as { user?: AuthenticatedUser }).user = user;
  };
}

export function requireOwnerFromEvent(event: H3Event): AuthenticatedUser {
  const user = (event.context as { user?: AuthenticatedUser }).user;
  if (!user) {
    throw new HTTPError({ status: 401, statusText: "Unauthorized" });
  }
  if (!user.roles.includes("OWNER")) {
    throw new HTTPError({ status: 403, statusText: "Forbidden" });
  }
  return user;
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

  if (!requiresSessionAuth(event.url.pathname)) {
    return;
  }

  const user = await resolveAuthenticatedUser({ db, session: session.data });

  if (!user) {
    throw new HTTPError({ status: 401, statusText: "Unauthorized" });
  }

  (event.context as { user?: typeof user }).user = user;
});
/* c8 ignore stop */
