import React from "react";
import { describe, expect, it, vi } from "vitest";

describe("auth routes", () => {
  it("wires the login route", async () => {
    const handleLoginRequestMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.doMock("../../lib/auth-server", () => ({
      handleLoginRequest: handleLoginRequestMock,
    }));
    const { Route } = await import("./login");
    const handlers = Route.options.server?.handlers as {
      GET: () => Promise<Response>;
    };

    expect(React.isValidElement((Route.options.component as () => React.ReactElement)())).toBe(true);
    await expect(handlers.GET()).resolves.toBeInstanceOf(Response);
    expect(handleLoginRequestMock).toHaveBeenCalled();
  });

  it("wires the callback route", async () => {
    const handleCallbackRequestMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.doMock("../../lib/auth-server", () => ({
      handleCallbackRequest: handleCallbackRequestMock,
    }));
    const { Route } = await import("./callback");
    const handlers = Route.options.server?.handlers as {
      GET: () => Promise<Response>;
    };

    expect(React.isValidElement((Route.options.component as () => React.ReactElement)())).toBe(true);
    await expect(handlers.GET()).resolves.toBeInstanceOf(Response);
    expect(handleCallbackRequestMock).toHaveBeenCalled();
  });

  it("wires the logout route for both methods", async () => {
    const handleLogoutRequestMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.doMock("../../lib/auth-server", () => ({
      handleLogoutRequest: handleLogoutRequestMock,
    }));
    const { Route } = await import("./logout");
    const handlers = Route.options.server?.handlers as {
      GET: () => Promise<Response>;
      POST: () => Promise<Response>;
    };

    expect(React.isValidElement((Route.options.component as () => React.ReactElement)())).toBe(true);
    await expect(handlers.GET()).resolves.toBeInstanceOf(Response);
    await expect(handlers.POST()).resolves.toBeInstanceOf(Response);
    expect(handleLogoutRequestMock).toHaveBeenCalledTimes(2);
  });
});
