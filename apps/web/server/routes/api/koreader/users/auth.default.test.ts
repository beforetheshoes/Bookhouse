import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const { mockFindCredential, mockVerifyPassword } = vi.hoisted(() => ({
  mockFindCredential: vi.fn(),
  mockVerifyPassword: vi.fn(),
}));

vi.mock("h3", async () => {
  const actual = await vi.importActual<typeof import("h3")>("h3");
  return {
    ...actual,
    defineEventHandler: (handler: (event: H3Event) => unknown) => handler,
    getRequestHeader: (event: { _headers?: Record<string, string> }, name: string) =>
      event._headers?.[name.toLowerCase()] ?? null,
  };
});

vi.mock("@bookhouse/db", () => ({
  db: {
    koreaderCredential: {
      findUnique: mockFindCredential,
    },
  },
}));

vi.mock("@bookhouse/opds", () => ({
  verifyPassword: mockVerifyPassword,
}));

const { default: handler } = await import("./auth");

describe("KOReader users/auth default handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindCredential.mockResolvedValue({
      id: "kc1",
      userId: "u1",
      username: "reader",
      passwordHash: "salt:hash",
      isEnabled: true,
    });
    mockVerifyPassword.mockResolvedValue(true);
  });

  it("authenticates and returns the KOReader authorization payload", async () => {
    await expect(handler({
      _headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      },
    } as unknown as H3Event)).resolves.toEqual({ authorized: "OK" });

    expect(mockFindCredential).toHaveBeenCalledWith({ where: { username: "reader" } });
    expect(mockVerifyPassword).toHaveBeenCalledWith("secret", "salt:hash");
  });
});
