import { createError, getRequestHeader } from "h3";
import type { H3Event } from "h3";

export interface KoreaderAuthDeps {
  findCredentialByUsername: (username: string) => Promise<{
    id: string;
    userId: string;
    username: string;
    passwordHash: string;
    isEnabled: boolean;
  } | null>;
  verifyPassword: (password: string, stored: string) => Promise<boolean>;
}

export interface KoreaderAuthResult {
  credentialId: string;
  userId: string;
  username: string;
}

function createAuthError(statusCode: number, message: string): Error & {
  statusCode: number;
  statusMessage: string;
} {
  return createError({
    statusCode,
    statusMessage: statusCode === 403 ? "Forbidden" : "Unauthorized",
    message,
  }) as Error & { statusCode: number; statusMessage: string };
}

export function createKoreaderAuth(deps: KoreaderAuthDeps) {
  return async (event: H3Event): Promise<KoreaderAuthResult> => {
    const username = getRequestHeader(event, "x-auth-user");
    const password = getRequestHeader(event, "x-auth-key");

    if (!username || !password) {
      throw createAuthError(401, "Unauthorized");
    }

    const credential = await deps.findCredentialByUsername(username);
    if (!credential) {
      throw createAuthError(401, "Unauthorized");
    }

    if (!credential.isEnabled) {
      throw createAuthError(403, "Credential is disabled");
    }

    const valid = await deps.verifyPassword(password, credential.passwordHash);
    if (!valid) {
      throw createAuthError(401, "Unauthorized");
    }

    return {
      credentialId: credential.id,
      userId: credential.userId,
      username: credential.username,
    };
  };
}
