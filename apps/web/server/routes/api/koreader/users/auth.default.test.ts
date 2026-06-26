import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const { mockFindCredential, mockVerifyPassword } = vi.hoisted(() => ({
  mockFindCredential: vi.fn(),
  mockVerifyPassword: vi.fn(),
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: H3Event) => object | Promise<object>) => handler,
}));

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
      req: new Request("http://localhost/", { headers: {
        "x-auth-user": "reader",
        "x-auth-key": "secret",
      } }),
    } as Partial<H3Event> as H3Event)).resolves.toEqual({ authorized: "OK" });

    expect(mockFindCredential).toHaveBeenCalledWith({ where: { username: "reader" } });
    expect(mockVerifyPassword).toHaveBeenCalledWith("secret", "salt:hash");
  });
});
