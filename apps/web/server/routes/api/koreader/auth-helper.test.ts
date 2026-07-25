import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import type { KoreaderAuthDeps } from "./auth-helper";

vi.mock("h3", () => ({
  HTTPError: class HTTPError extends Error {
    status: number;
    statusText: string | undefined;
    constructor(opts: { status: number; statusText?: string; message?: string }) {
      super(opts.message ?? opts.statusText);
      this.status = opts.status;
      this.statusText = opts.statusText;
    }
  },
}));

const { createKoreaderAuth } = await import("./auth-helper");

function makeEvent(headers: Record<string, string> = {}): H3Event {
  return { req: new Request("http://localhost/", { headers: headers }) } as Partial<H3Event> as H3Event;
}

function makeDeps(overrides: Partial<KoreaderAuthDeps> = {}): KoreaderAuthDeps {
  return {
    findCredentialByUsername: vi.fn().mockResolvedValue({
      id: "kc1",
      userId: "u1",
      username: "reader",
      passwordHash: "salt:hash",
      isEnabled: true,
    }),
    verifyPassword: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("createKoreaderAuth", () => {
  it("returns auth result for valid headers", async () => {
    const deps = makeDeps();
    const auth = createKoreaderAuth(deps);

    const result = await auth(makeEvent({
      "x-auth-user": "reader",
      "x-auth-key": "secret",
    }));

    expect(result).toEqual({
      credentialId: "kc1",
      userId: "u1",
      username: "reader",
    });
  });

  it("throws 401 when auth headers are missing", async () => {
    const auth = createKoreaderAuth(makeDeps());

    await expect(auth(makeEvent())).rejects.toThrow(expect.objectContaining({ status: 401 }));
  });

  it("throws 403 when the credential is disabled", async () => {
    const auth = createKoreaderAuth(makeDeps({
      findCredentialByUsername: vi.fn().mockResolvedValue({
        id: "kc1",
        userId: "u1",
        username: "reader",
        passwordHash: "salt:hash",
        isEnabled: false,
      }),
    }));

    await expect(auth(makeEvent({
      "x-auth-user": "reader",
      "x-auth-key": "secret",
    }))).rejects.toThrow(expect.objectContaining({ status: 403 }));
  });

  it("throws 401 when the credential does not exist", async () => {
    const auth = createKoreaderAuth(makeDeps({
      findCredentialByUsername: vi.fn().mockResolvedValue(null),
    }));

    await expect(auth(makeEvent({
      "x-auth-user": "reader",
      "x-auth-key": "secret",
    }))).rejects.toThrow(expect.objectContaining({ status: 401 }));
  });

  it("throws 401 when the password is invalid", async () => {
    const auth = createKoreaderAuth(makeDeps({
      verifyPassword: vi.fn().mockResolvedValue(false),
    }));

    await expect(auth(makeEvent({
      "x-auth-user": "reader",
      "x-auth-key": "wrong",
    }))).rejects.toThrow(expect.objectContaining({ status: 401 }));
  });
});
