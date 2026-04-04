import type { H3Event } from "h3";

export interface OpdsAuthDeps {
  findCredentialByUsername: (username: string) => Promise<{
    id: string;
    userId: string;
    username: string;
    passwordHash: string;
    isEnabled: boolean;
  } | null>;
  verifyPassword: (password: string, stored: string) => Promise<boolean>;
}

export interface OpdsAuthResult {
  credentialId: string;
  userId: string;
  username: string;
}

export function createOpdsAuth(deps: OpdsAuthDeps) {
  return async (event: H3Event): Promise<OpdsAuthResult> => {
    const authorization = (event.node?.req?.headers?.authorization ??
      (event as unknown as { headers?: Record<string, string | undefined> }).headers?.authorization) as
      | string
      | undefined;

    if (!authorization) {
      throw Object.assign(new Error("Authentication required"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
        headers: { "WWW-Authenticate": 'Basic realm="Bookhouse OPDS"' },
      });
    }

    if (!authorization.startsWith("Basic ")) {
      throw Object.assign(new Error("Basic authentication required"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
        headers: { "WWW-Authenticate": 'Basic realm="Bookhouse OPDS"' },
      });
    }

    const encoded = authorization.slice(6);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");

    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      throw Object.assign(new Error("Invalid credentials format"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
        headers: { "WWW-Authenticate": 'Basic realm="Bookhouse OPDS"' },
      });
    }

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const credential = await deps.findCredentialByUsername(username);
    if (!credential) {
      throw Object.assign(new Error("Invalid credentials"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
        headers: { "WWW-Authenticate": 'Basic realm="Bookhouse OPDS"' },
      });
    }

    if (!credential.isEnabled) {
      throw Object.assign(new Error("Credential is disabled"), {
        statusCode: 403,
        statusMessage: "Forbidden",
      });
    }

    const valid = await deps.verifyPassword(password, credential.passwordHash);
    if (!valid) {
      throw Object.assign(new Error("Invalid credentials"), {
        statusCode: 401,
        statusMessage: "Unauthorized",
        headers: { "WWW-Authenticate": 'Basic realm="Bookhouse OPDS"' },
      });
    }

    return {
      credentialId: credential.id,
      userId: credential.userId,
      username: credential.username,
    };
  };
}
