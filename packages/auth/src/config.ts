import { z } from "zod";
import type { AuthConfig } from "./types";

const envSchema = z.object({
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_OIDC_ISSUER: z.string().url(),
  AUTH_OIDC_CLIENT_ID: z.string().min(1),
  AUTH_OIDC_CLIENT_SECRET: z.string().min(1),
  AUTH_OIDC_SCOPES: z.string().optional(),
  APP_URL: z.string().url(),
});

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath || "/";

  return url.toString().replace(/\/$/, "");
}

function parseScopes(scopes?: string): string[] {
  if (!scopes) {
    return ["openid", "profile", "email"];
  }

  return scopes
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function loadAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const parsed = envSchema.parse(env);

  return {
    secret: parsed.AUTH_SECRET,
    issuer: normalizeUrl(parsed.AUTH_OIDC_ISSUER),
    clientId: parsed.AUTH_OIDC_CLIENT_ID,
    clientSecret: parsed.AUTH_OIDC_CLIENT_SECRET,
    appUrl: normalizeUrl(parsed.APP_URL),
    scopes: parseScopes(parsed.AUTH_OIDC_SCOPES),
  };
}

export function getOidcCallbackUrl(config: AuthConfig): string {
  return new URL("/auth/callback", `${config.appUrl}/`).toString();
}

export function getPostLogoutRedirectUrl(config: AuthConfig): string {
  return new URL("/auth/login", `${config.appUrl}/`).toString();
}
