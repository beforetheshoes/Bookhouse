import { HTTPError } from "h3";
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

function throw401(event: H3Event, message: string): never {
  event.res.headers.set("WWW-Authenticate", 'Basic realm="Bookhouse OPDS"');
  throw new HTTPError({ status: 401, statusText: "Unauthorized", message });
}

export function createOpdsAuth(deps: OpdsAuthDeps) {
  return async (event: H3Event): Promise<OpdsAuthResult> => {
    const authorization = event.req.headers.get("authorization");

    if (!authorization) {
      throw401(event, "Authentication required");
    }

    if (!authorization.startsWith("Basic ")) {
      throw401(event, "Basic authentication required");
    }

    const encoded = authorization.slice(6);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");

    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      throw401(event, "Invalid credentials format");
    }

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const credential = await deps.findCredentialByUsername(username);
    if (!credential) {
      throw401(event, "Invalid credentials");
    }

    if (!credential.isEnabled) {
      throw new HTTPError({ status: 403, statusText: "Forbidden", message: "Credential is disabled" });
    }

    const valid = await deps.verifyPassword(password, credential.passwordHash);
    if (!valid) {
      throw401(event, "Invalid credentials");
    }

    return {
      credentialId: credential.id,
      userId: credential.userId,
      username: credential.username,
    };
  };
}
