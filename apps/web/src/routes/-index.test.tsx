import React from "react";
import { describe, expect, it, vi } from "vitest";

const getCurrentUserServerFnMock = vi.fn();

vi.mock("../lib/auth-client", () => ({
  getCurrentUserServerFn: getCurrentUserServerFnMock,
}));

describe("index route", () => {
  it("redirects unauthenticated requests to login", async () => {
    const { Route } = await import("./index");
    getCurrentUserServerFnMock.mockResolvedValueOnce(null);
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string; hash: string };
      serverContext?: unknown;
    }) => Promise<unknown>;

    await expect(
      loader({
        location: {
          pathname: "/",
          search: "",
          hash: "",
        },
        serverContext: undefined,
      }),
    ).rejects.toMatchObject({
      options: {
        href: "/auth/login",
      },
    });
  });

  it("returns the authenticated user from server context", async () => {
    const { Home, Route } = await import("./index");
    const user = {
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    };
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string; hash: string };
      serverContext?: unknown;
    }) => Promise<unknown>;
    const loaderData = await loader({
      location: {
        pathname: "/",
        search: "",
        hash: "",
      },
      serverContext: {
        auth: {
          user,
        },
      },
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);

    const element = Home();

    expect(React.isValidElement(element)).toBe(true);
    expect(loaderData).toEqual({ user });
  });

  it("loads the current user from the server helper when server context is empty", async () => {
    const { Home, Route } = await import("./index");
    const user = {
      id: "user-2",
      email: null,
      name: null,
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-2",
    };
    getCurrentUserServerFnMock.mockResolvedValueOnce(user);
    const loader = Route.options.loader as unknown as (input: {
      location: { pathname: string; search: string; hash: string };
      serverContext?: unknown;
    }) => Promise<{ user: typeof user }>;
    const loaderData = await loader({
      location: {
        pathname: "/",
        search: "",
        hash: "",
      },
      serverContext: {},
    });

    vi.spyOn(Route, "useLoaderData").mockReturnValue(loaderData as never);

    const element = Home();

    expect(React.isValidElement(element)).toBe(true);
    expect(loaderData).toEqual({ user });
  });
});
