import { describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import type { KoreaderAuthDeps } from "./auth-helper";

vi.mock("h3", () => ({
  getRequestHeader: (event: { _headers?: Record<string, string> }, name: string) =>
    event._headers?.[name.toLowerCase()] ?? null,
  createError: (opts: { statusCode: number; statusMessage: string; message: string }) => {
    const err = new Error(opts.message) as Error & { statusCode: number; statusMessage: string };
    err.statusCode = opts.statusCode;
    err.statusMessage = opts.statusMessage;
    return err;
  },
}));

const { createKoreaderAuth } = await import("./auth-helper");

function makeEvent(headers: Record<string, string> = {}): H3Event {
  return { _headers: headers } as unknown as H3Event;
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

    await expect(auth(makeEvent())).rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
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
    }))).rejects.toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("throws 401 when the credential does not exist", async () => {
    const auth = createKoreaderAuth(makeDeps({
      findCredentialByUsername: vi.fn().mockResolvedValue(null),
    }));

    await expect(auth(makeEvent({
      "x-auth-user": "reader",
      "x-auth-key": "secret",
    }))).rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  it("throws 401 when the password is invalid", async () => {
    const auth = createKoreaderAuth(makeDeps({
      verifyPassword: vi.fn().mockResolvedValue(false),
    }));

    await expect(auth(makeEvent({
      "x-auth-user": "reader",
      "x-auth-key": "wrong",
    }))).rejects.toThrow(expect.objectContaining({ statusCode: 401 }));
  });
});
