import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: (...args: Array<object>) => object) => fn,
  }),
}));

vi.mock("./auth-server", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: "user-1",
    email: "reader@example.com",
    name: "Reader",
    image: null,
    issuer: "https://issuer.example.com",
    subject: "subject-1",
  }),
}));

describe("auth client bridge", () => {
  it("proxies the current user through a server function", async () => {
    const { getCurrentUserServerFn } = await import("./auth-client");

    await expect(getCurrentUserServerFn()).resolves.toEqual({
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });
  });
});
