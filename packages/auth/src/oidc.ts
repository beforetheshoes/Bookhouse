import * as oidc from "openid-client";
import type {
  AuthConfig,
  AuthorizationRequestResult,
  NormalizedOidcClaims,
  OidcClaimsRecord,
} from "./types";
import { getOidcCallbackUrl, getPostLogoutRedirectUrl } from "./config";

const configurationCache = new Map<string, Promise<oidc.Configuration>>();

function getCacheKey(config: AuthConfig): string {
  return JSON.stringify({
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    appUrl: config.appUrl,
  });
}

export function clearOidcConfigurationCache(): void {
  configurationCache.clear();
}

export async function getOidcConfiguration(
  config: AuthConfig,
): Promise<oidc.Configuration> {
  const cacheKey = getCacheKey(config);
  const cached = configurationCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const issuerUrl = new URL(config.issuer);
  const isHttp = issuerUrl.protocol === "http:";

  const configurationPromise = isHttp
    ? oidc.discovery(
        issuerUrl,
        config.clientId,
        {
          client_secret: config.clientSecret,
          redirect_uris: [getOidcCallbackUrl(config)],
          response_types: ["code"],
        },
        oidc.ClientSecretPost(config.clientSecret),
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        { execute: [oidc.allowInsecureRequests] },
      )
    : oidc.discovery(
        issuerUrl,
        config.clientId,
        {
          client_secret: config.clientSecret,
          redirect_uris: [getOidcCallbackUrl(config)],
          response_types: ["code"],
        },
        oidc.ClientSecretPost(config.clientSecret),
      );

  configurationCache.set(cacheKey, configurationPromise);

  return configurationPromise;
}

export async function createAuthorizationRequest(
  config: AuthConfig,
  returnTo: string,
): Promise<AuthorizationRequestResult> {
  const oidcConfig = await getOidcConfiguration(config);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authorizationUrl = oidc.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: getOidcCallbackUrl(config),
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    authorizationUrl,
    login: {
      state,
      nonce,
      codeVerifier,
      returnTo,
    },
  };
}

function pickString(...values: Array<oidc.JsonValue | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

export function normalizeOidcClaims(
  idTokenClaims: OidcClaimsRecord,
  userInfoClaims?: OidcClaimsRecord,
): NormalizedOidcClaims {
  const merged: OidcClaimsRecord = {
    ...idTokenClaims,
    ...(userInfoClaims ?? {}),
  };

  const subject = pickString(merged.sub);

  if (!subject) {
    throw new Error("OIDC response is missing a subject claim");
  }

  return {
    sub: subject,
    email: pickString(merged.email),
    emailVerified: merged.email_verified === true,
    name: pickString(merged.name, merged.preferred_username, merged.email),
    preferredUsername: pickString(merged.preferred_username),
    image: pickString(merged.picture, merged.avatar_url),
    raw: merged,
  };
}

export async function exchangeAuthorizationCode(input: {
  config: AuthConfig;
  currentUrl: URL;
  codeVerifier: string;
  expectedState: string;
  expectedNonce: string;
}): Promise<{
  claims: NormalizedOidcClaims;
  endSessionUrl: string | null;
}> {
  const oidcConfig = await getOidcConfiguration(input.config);
  const tokens = await oidc.authorizationCodeGrant(oidcConfig, input.currentUrl, {
    pkceCodeVerifier: input.codeVerifier,
    expectedState: input.expectedState,
    expectedNonce: input.expectedNonce,
  });

  const idTokenClaims = tokens.claims();
  if (!idTokenClaims) {
    throw new Error("OIDC token response did not contain ID token claims");
  }

  let userInfoClaims: oidc.UserInfoResponse | undefined;

  if (
    tokens.access_token &&
    oidcConfig.serverMetadata().userinfo_endpoint
  ) {
    userInfoClaims = await oidc.fetchUserInfo(
      oidcConfig,
      tokens.access_token,
      idTokenClaims.sub,
    );
  }

  const endSessionEndpoint = oidcConfig.serverMetadata().end_session_endpoint;
  const endSessionUrl = endSessionEndpoint
    ? new URL(endSessionEndpoint)
    : null;

  if (endSessionUrl) {
    endSessionUrl.searchParams.set(
      "post_logout_redirect_uri",
      getPostLogoutRedirectUrl(input.config),
    );
  }

  return {
    claims: normalizeOidcClaims(idTokenClaims, userInfoClaims),
    endSessionUrl: endSessionUrl?.toString() ?? null,
  };
}
