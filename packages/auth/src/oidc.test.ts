import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthConfig } from "./types";

const discoveryMock = vi.fn();
const randomPKCECodeVerifierMock = vi.fn();
const calculatePKCECodeChallengeMock = vi.fn();
const randomStateMock = vi.fn();
const randomNonceMock = vi.fn();
const buildAuthorizationUrlMock = vi.fn();
const authorizationCodeGrantMock = vi.fn();
const fetchUserInfoMock = vi.fn();
const clientSecretPostMock = vi.fn();

vi.mock("openid-client", () => ({
  discovery: discoveryMock,
  randomPKCECodeVerifier: randomPKCECodeVerifierMock,
  calculatePKCECodeChallenge: calculatePKCECodeChallengeMock,
  randomState: randomStateMock,
  randomNonce: randomNonceMock,
  buildAuthorizationUrl: buildAuthorizationUrlMock,
  authorizationCodeGrant: authorizationCodeGrantMock,
  fetchUserInfo: fetchUserInfoMock,
  ClientSecretPost: clientSecretPostMock,
}));

const authConfig: AuthConfig = {
  secret: "a".repeat(32),
  issuer: "https://issuer.example.com",
  clientId: "bookhouse",
  clientSecret: "secret",
  appUrl: "http://localhost:3000",
  scopes: ["openid", "profile", "email"],
};

describe("oidc helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates an authorization request and caches discovery", async () => {
    const fakeConfiguration = {};
    discoveryMock.mockResolvedValue(fakeConfiguration);
    clientSecretPostMock.mockReturnValue("post-auth");
    randomPKCECodeVerifierMock.mockReturnValue("verifier");
    calculatePKCECodeChallengeMock.mockResolvedValue("challenge");
    randomStateMock.mockReturnValue("state");
    randomNonceMock.mockReturnValue("nonce");
    buildAuthorizationUrlMock.mockReturnValue(
      new URL("https://issuer.example.com/authorize"),
    );

    const { clearOidcConfigurationCache, createAuthorizationRequest } =
      await import("./oidc");

    clearOidcConfigurationCache();

    const first = await createAuthorizationRequest(authConfig, "/books");
    const second = await createAuthorizationRequest(authConfig, "/books");

    expect(discoveryMock).toHaveBeenCalledTimes(1);
    expect(clientSecretPostMock).toHaveBeenCalledWith("secret");
    expect(buildAuthorizationUrlMock).toHaveBeenCalledWith(fakeConfiguration, {
      redirect_uri: "http://localhost:3000/auth/callback",
      response_type: "code",
      scope: "openid profile email",
      state: "state",
      nonce: "nonce",
      code_challenge: "challenge",
      code_challenge_method: "S256",
    });
    expect(first.authorizationUrl.toString()).toBe(
      "https://issuer.example.com/authorize",
    );
    expect(first.login.returnTo).toBe("/books");
    expect(second.login.codeVerifier).toBe("verifier");
  });

  it("normalizes claims and exchanges the authorization code", async () => {
    const serverMetadata = vi.fn(() => ({
      userinfo_endpoint: "https://issuer.example.com/userinfo",
      end_session_endpoint: "https://issuer.example.com/logout",
    }));
    discoveryMock.mockResolvedValue({
      serverMetadata,
    });
    authorizationCodeGrantMock.mockResolvedValue({
      access_token: "access-token",
      claims: () => ({
        sub: "subject-1",
        email: "id@example.com",
        name: "ID Name",
      }),
    });
    fetchUserInfoMock.mockResolvedValue({
      sub: "subject-1",
      email: "user@example.com",
      email_verified: true,
      preferred_username: "reader",
      picture: "https://avatar.example.com/pic.png",
    });

    const { exchangeAuthorizationCode, normalizeOidcClaims } = await import(
      "./oidc"
    );

    expect(
      normalizeOidcClaims(
        { sub: "subject-1", email: "id@example.com" },
        {
          email: "user@example.com",
          email_verified: true,
          preferred_username: "reader",
        },
      ),
    ).toEqual({
      sub: "subject-1",
      email: "user@example.com",
      emailVerified: true,
      name: "reader",
      preferredUsername: "reader",
      image: null,
      raw: {
        sub: "subject-1",
        email: "user@example.com",
        email_verified: true,
        preferred_username: "reader",
      },
    });

    const result = await exchangeAuthorizationCode({
      config: authConfig,
      currentUrl: new URL("http://localhost:3000/auth/callback?code=abc&state=state"),
      codeVerifier: "verifier",
      expectedState: "state",
      expectedNonce: "nonce",
    });

    expect(authorizationCodeGrantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverMetadata,
      }),
      new URL("http://localhost:3000/auth/callback?code=abc&state=state"),
      {
        pkceCodeVerifier: "verifier",
        expectedState: "state",
        expectedNonce: "nonce",
      },
    );
    expect(fetchUserInfoMock).toHaveBeenCalledWith(
      expect.anything(),
      "access-token",
      "subject-1",
    );
    expect(result.claims).toMatchObject({
      sub: "subject-1",
      email: "user@example.com",
      emailVerified: true,
      preferredUsername: "reader",
      image: "https://avatar.example.com/pic.png",
    });
    expect(result.endSessionUrl).toBe(
      "https://issuer.example.com/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Flogin",
    );
  });

  it("rejects claims without a subject", async () => {
    const { normalizeOidcClaims } = await import("./oidc");

    expect(() => normalizeOidcClaims([], undefined)).toThrow(
      "OIDC response is missing a subject claim",
    );
  });

  it("fails when the token response has no ID token claims", async () => {
    discoveryMock.mockResolvedValue({
      serverMetadata: () => ({}),
    });
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => undefined,
    });

    const { exchangeAuthorizationCode } = await import("./oidc");

    await expect(
      exchangeAuthorizationCode({
        config: authConfig,
        currentUrl: new URL(
          "http://localhost:3000/auth/callback?code=abc&state=state",
        ),
        codeVerifier: "verifier",
        expectedState: "state",
        expectedNonce: "nonce",
      }),
    ).rejects.toThrow("OIDC token response did not contain ID token claims");
  });

  it("skips optional userinfo and logout calls when the provider does not advertise them", async () => {
    discoveryMock.mockResolvedValue({
      serverMetadata: () => ({}),
    });
    authorizationCodeGrantMock.mockResolvedValue({
      access_token: undefined,
      claims: () => ({
        sub: "subject-2",
      }),
    });

    const { exchangeAuthorizationCode } = await import("./oidc");
    const result = await exchangeAuthorizationCode({
      config: authConfig,
      currentUrl: new URL("http://localhost:3000/auth/callback?code=abc&state=state"),
      codeVerifier: "verifier",
      expectedState: "state",
      expectedNonce: "nonce",
    });

    expect(fetchUserInfoMock).not.toHaveBeenCalled();
    expect(result.endSessionUrl).toBeNull();
    expect(result.claims.sub).toBe("subject-2");
  });
});
