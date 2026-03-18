import {
  createAuthenticatedSession,
  createAuthorizationRequest,
  clearSession,
  exchangeAuthorizationCode,
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
import { getE2eFixtureUser, isE2eFixtureMode } from "./e2e-fixtures";

const authConfig = loadAuthConfig();

type AuthSessionManager = {
  readonly id: string | undefined;
  readonly data: Partial<AuthSessionData>;
  update: (update: Partial<AuthSessionData>) => Promise<unknown>;
  clear: () => Promise<unknown>;
};

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
  if (isE2eFixtureMode()) {
    return getE2eFixtureUser();
  }

  const session = await getAuthSession();

  return resolveAuthenticatedUser({
    db,
    session: session.data,
  });
}

export const getCurrentUserServerFn = createServerFn({ method: "GET" }).handler(
  async () => getCurrentUser(),
);

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

  const user = await upsertOidcUser({
    db,
    config: authConfig,
    claims,
  });

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
