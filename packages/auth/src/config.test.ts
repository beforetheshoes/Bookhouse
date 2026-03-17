import { describe, expect, it } from "vitest";
import {
  getOidcCallbackUrl,
  getPostLogoutRedirectUrl,
  loadAuthConfig,
} from "./config";

describe("loadAuthConfig", () => {
  it("parses required environment variables and default scopes", () => {
    const config = loadAuthConfig({
      AUTH_SECRET: "a".repeat(32),
      AUTH_OIDC_ISSUER: "https://issuer.example.com/",
      AUTH_OIDC_CLIENT_ID: "bookhouse",
      AUTH_OIDC_CLIENT_SECRET: "secret",
      APP_URL: "http://localhost:3000/",
    });

    expect(config).toEqual({
      secret: "a".repeat(32),
      issuer: "https://issuer.example.com",
      clientId: "bookhouse",
      clientSecret: "secret",
      appUrl: "http://localhost:3000",
      scopes: ["openid", "profile", "email"],
    });
    expect(getOidcCallbackUrl(config)).toBe("http://localhost:3000/auth/callback");
    expect(getPostLogoutRedirectUrl(config)).toBe("http://localhost:3000/auth/login");
  });

  it("supports custom scopes", () => {
    const config = loadAuthConfig({
      AUTH_SECRET: "b".repeat(32),
      AUTH_OIDC_ISSUER: "https://issuer.example.com/oidc/",
      AUTH_OIDC_CLIENT_ID: "bookhouse",
      AUTH_OIDC_CLIENT_SECRET: "secret",
      AUTH_OIDC_SCOPES: "openid profile email groups",
      APP_URL: "https://bookhouse.example.com/app/",
    });

    expect(config.issuer).toBe("https://issuer.example.com/oidc");
    expect(config.appUrl).toBe("https://bookhouse.example.com/app");
    expect(config.scopes).toEqual(["openid", "profile", "email", "groups"]);
  });
});
