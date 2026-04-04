import { describe, expect, it, vi } from "vitest";
import { createOpdsAuth } from "./auth-helper";
import type { OpdsAuthDeps } from "./auth-helper";
import type { H3Event } from "h3";

const mockCredential = {
  id: "cred-1",
  userId: "user-1",
  username: "reader",
  passwordHash: "salt:hash",
  isEnabled: true,
};

function makeEvent(authorization?: string): H3Event {
  return {
    node: {
      req: {
        headers: authorization ? { authorization } : {},
      },
    },
  } as unknown as H3Event;
}

function makeDeps(overrides: Partial<OpdsAuthDeps> = {}): OpdsAuthDeps {
  return {
    findCredentialByUsername: vi.fn().mockResolvedValue(mockCredential),
    verifyPassword: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("createOpdsAuth", () => {
  it("returns auth result for valid credentials", async () => {
    const deps = makeDeps();
    const auth = createOpdsAuth(deps);
    const result = await auth(makeEvent(basicAuth("reader", "password123")));

    expect(result).toEqual({
      credentialId: "cred-1",
      userId: "user-1",
      username: "reader",
    });
    expect(deps.findCredentialByUsername).toHaveBeenCalledWith("reader");
    expect(deps.verifyPassword).toHaveBeenCalledWith("password123", "salt:hash");
  });

  it("throws 401 when Authorization header is missing", async () => {
    const deps = makeDeps();
    const auth = createOpdsAuth(deps);

    try {
      await auth(makeEvent());
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number; headers: Record<string, string> };
      expect(err.statusCode).toBe(401);
      expect(err.headers["WWW-Authenticate"]).toBe('Basic realm="Bookhouse OPDS"');
    }
  });

  it("throws 401 for non-Basic auth scheme", async () => {
    const deps = makeDeps();
    const auth = createOpdsAuth(deps);

    try {
      await auth(makeEvent("Bearer some-token"));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number; headers: Record<string, string> };
      expect(err.statusCode).toBe(401);
      expect(err.headers["WWW-Authenticate"]).toBe('Basic realm="Bookhouse OPDS"');
    }
  });

  it("throws 401 when decoded credentials have no colon separator", async () => {
    const deps = makeDeps();
    const auth = createOpdsAuth(deps);
    try {
      await auth(makeEvent(`Basic ${Buffer.from("nocolon").toString("base64")}`));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(401);
    }
  });

  it("throws 401 when username not found", async () => {
    const deps = makeDeps({
      findCredentialByUsername: vi.fn().mockResolvedValue(null),
    });
    const auth = createOpdsAuth(deps);

    try {
      await auth(makeEvent(basicAuth("unknown", "password")));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(401);
    }
  });

  it("throws 401 when password is wrong", async () => {
    const deps = makeDeps({
      verifyPassword: vi.fn().mockResolvedValue(false),
    });
    const auth = createOpdsAuth(deps);

    try {
      await auth(makeEvent(basicAuth("reader", "wrong")));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(401);
    }
  });

  it("throws 403 when credential is disabled", async () => {
    const deps = makeDeps({
      findCredentialByUsername: vi.fn().mockResolvedValue({
        ...mockCredential,
        isEnabled: false,
      }),
    });
    const auth = createOpdsAuth(deps);

    try {
      await auth(makeEvent(basicAuth("reader", "password")));
      expect.fail("Should have thrown");
    } catch (e) {
      const err = e as Error & { statusCode: number };
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe("Credential is disabled");
    }
  });

  it("handles password containing colons", async () => {
    const deps = makeDeps();
    const auth = createOpdsAuth(deps);
    await auth(makeEvent(basicAuth("reader", "pass:word:with:colons")));

    expect(deps.verifyPassword).toHaveBeenCalledWith("pass:word:with:colons", "salt:hash");
  });
});
