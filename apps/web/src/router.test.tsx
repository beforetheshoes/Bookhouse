import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/auth-server", () => ({
  handleCallbackRequest: vi.fn(),
  handleLoginRequest: vi.fn(),
  handleLogoutRequest: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("./lib/auth-client", () => ({
  getCurrentUserServerFn: vi.fn(),
}));

describe("router helpers", () => {
  it("creates a router instance", async () => {
    // Loading the full routeTree (all routes + components) can take >5s
    const { createRouter, getRouter } = await import("./router");
    const router = createRouter();

    expect(router.options.defaultPreload).toBe("intent");
    expect(router.options.scrollRestoration).toBe(true);
    expect(getRouter()).toBeDefined();
  }, 30_000);
});
