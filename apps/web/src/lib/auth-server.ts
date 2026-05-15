import {
  AuthAccessDeniedError,
  OWNER_ROLE,
  createAuthenticatedSession,
  createAuthorizationRequest,
  clearSession,
  exchangeAuthorizationCode,
  isOwner,
  loadAuthConfig,
  resolveAuthenticatedUser,
  upsertOidcUser,
  type AuthSessionData,
  type AuthenticatedUser,
} from "@bookhouse/auth";
import { db } from "@bookhouse/db";
import { createServerFn } from "@tanstack/react-start";
import {
  clearSession as clearStartSession,
  getRequest,
  getRequestUrl,
  useSession,
} from "@tanstack/react-start/server";

const authConfig = loadAuthConfig();

type AuthSessionManager = Awaited<ReturnType<typeof useSession<AuthSessionData>>>;

function appUrl(pathname: string): string {
  return new URL(pathname, `${authConfig.appUrl}/`).toString();
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  });
}

export const authSessionConfig = {
  password: authConfig.secret,
  name: "bookhouse-auth",
  maxAge: 60 * 60 * 24 * 7,
  cookie: {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: new URL(authConfig.appUrl).protocol === "https:",
  },
};

export async function getAuthSession(): Promise<AuthSessionManager> {
  return useSession<AuthSessionData>(authSessionConfig);
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await getAuthSession();

  return resolveAuthenticatedUser({
    db,
    session: session.data,
  });
}

export const getCurrentUserServerFn = createServerFn({ method: "GET" }).handler(
  async () => getCurrentUser(),
);

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireAuthenticated(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requireOwner(): Promise<AuthenticatedUser> {
  const user = await requireAuthenticated();
  if (!isOwner(user.roles)) {
    throw new ForbiddenError("Owner role required");
  }
  return user;
}

export { OWNER_ROLE };

function normalizeReturnTo(input: string | null | undefined): string {
  if (!input) {
    return "/";
  }

  if (!input.startsWith("/")) {
    return "/";
  }

  return input;
}

export async function handleLoginRequest(): Promise<Response> {
  const requestUrl = getRequestUrl();
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get("returnTo"));
  const session = await getAuthSession();
  const { authorizationUrl, login } = await createAuthorizationRequest(
    authConfig,
    returnTo,
  );

  await session.update({
    ...clearSession(),
    login,
  });

  return redirectResponse(authorizationUrl.toString());
}

export async function handleCallbackRequest(): Promise<Response> {
  const session = await getAuthSession();
  const login = session.data.login;

  if (!login) {
    return redirectResponse(appUrl("/auth/login"));
  }

  const { claims } = await exchangeAuthorizationCode({
    config: authConfig,
    currentUrl: new URL(getRequest().url),
    codeVerifier: login.codeVerifier,
    expectedState: login.state,
    expectedNonce: login.nonce,
  });

  let user: AuthenticatedUser;
  try {
    user = await upsertOidcUser({
      db,
      config: authConfig,
      claims,
    });
  } catch (error) {
    if (error instanceof AuthAccessDeniedError) {
      await session.update(clearSession());
      return redirectResponse(appUrl("/auth/denied"));
    }
    throw error;
  }

  await session.update(
    createAuthenticatedSession({
      userId: user.id,
      issuer: authConfig.issuer,
      subject: claims.sub,
    }),
  );

  return redirectResponse(appUrl(login.returnTo || "/"));
}

export async function handleLogoutRequest(): Promise<Response> {
  await clearStartSession(authSessionConfig);

  return redirectResponse(appUrl("/logged-out"));
}
