import { describe, expect, it, vi } from "vitest";

/** Cast route option function types that have no overlap with simple function types */
function asBeforeLoad<TResult>(fn: object): (input: { context?: object }) => Promise<TResult> {
  return fn as ((input: { context?: object }) => Promise<TResult>) & typeof fn;
}

const getCurrentUserServerFnMock = vi.fn();
const getThemeServerFnMock = vi.fn().mockResolvedValue("system");
const getColorModeServerFnMock = vi.fn().mockResolvedValue("book");
const getAccentColorServerFnMock = vi.fn().mockResolvedValue(null);

vi.mock("../lib/auth-client", () => ({
  getCurrentUserServerFn: getCurrentUserServerFnMock,
}));

vi.mock("~/lib/server-fns/app-settings", () => ({
  getThemeServerFn: getThemeServerFnMock,
  getColorModeServerFn: getColorModeServerFnMock,
  getAccentColorServerFn: getAccentColorServerFnMock,
}));

describe("_authenticated layout route", () => {
  it("redirects unauthenticated requests to login", async () => {
    const { Route } = await import("./_authenticated");
    getCurrentUserServerFnMock.mockResolvedValueOnce(null);
    const beforeLoad = asBeforeLoad<object>(Route.options.beforeLoad as object);

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
    const beforeLoad = asBeforeLoad<{ user: typeof user }>(Route.options.beforeLoad as object);

    const result = await beforeLoad({
      context: { auth: { user } },
    });

    expect(result).toEqual({ user, theme: "system", colorMode: "book", accentColor: null });
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
    const beforeLoad = asBeforeLoad<{ user: typeof user }>(Route.options.beforeLoad as object);

    const result = await beforeLoad({ context: {} });

    expect(result).toEqual({ user, theme: "system", colorMode: "book", accentColor: null });
  });

  it("returns stored theme preference", async () => {
    const { Route } = await import("./_authenticated");
    const user = {
      id: "user-3",
      email: "dark@example.com",
      name: "DarkUser",
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-3",
    };
    getCurrentUserServerFnMock.mockResolvedValueOnce(user);
    getThemeServerFnMock.mockResolvedValueOnce("dark");
    const beforeLoad = asBeforeLoad<object>(Route.options.beforeLoad as object);

    const result = await beforeLoad({ context: {} });

    expect(result).toEqual({ user, theme: "dark", colorMode: "book", accentColor: null });
  });
});
