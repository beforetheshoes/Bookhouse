import { describe, expect, it, vi } from "vitest";

const getCurrentUserServerFnMock = vi.fn();

vi.mock("../lib/auth-client", () => ({
  getCurrentUserServerFn: getCurrentUserServerFnMock,
}));

describe("_authenticated layout route", () => {
  it("redirects unauthenticated requests to login", async () => {
    const { Route } = await import("./_authenticated");
    getCurrentUserServerFnMock.mockResolvedValueOnce(null);
    const beforeLoad = Route.options.beforeLoad as unknown as (input: {
      context?: unknown;
    }) => Promise<unknown>;

    await expect(
      beforeLoad({ context: undefined }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
  });

  it("returns the authenticated user from server context", async () => {
    const { Route } = await import("./_authenticated");
    const user = {
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    };
    const beforeLoad = Route.options.beforeLoad as unknown as (input: {
      context?: unknown;
    }) => Promise<{ user: typeof user }>;

    const result = await beforeLoad({
      context: { auth: { user } },
    });

    expect(result).toEqual({ user });
  });

  it("falls back to getCurrentUserServerFn when server context is empty", async () => {
    const { Route } = await import("./_authenticated");
    const user = {
      id: "user-2",
      email: null,
      name: null,
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-2",
    };
    getCurrentUserServerFnMock.mockResolvedValueOnce(user);
    const beforeLoad = Route.options.beforeLoad as unknown as (input: {
      context?: unknown;
    }) => Promise<{ user: typeof user }>;

    const result = await beforeLoad({ context: {} });

    expect(result).toEqual({ user });
  });
});
