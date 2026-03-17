import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/auth-server", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

describe("start entry", () => {
  it("exports a start instance", async () => {
    const start = await import("./start");
    expect(start.default).toBeDefined();
    expect(typeof start.default.getOptions).toBe("function");
  });

  it("registers auth request middleware", async () => {
    const start = await import("./start");
    const options = await start.default.getOptions();

    expect(options.requestMiddleware).toHaveLength(1);
    const middleware = options.requestMiddleware?.[0];

    expect(middleware?.options.server).toBeTypeOf("function");
    await expect(
      middleware?.options.server?.({
        next: ({ context }: { context?: unknown } = {}) =>
          Promise.resolve({
            context,
            pathname: "/",
            request: new Request("http://localhost:3000/"),
            response: new Response(null, { status: 200 }),
          }),
      } as never),
    ).resolves.toMatchObject({
      context: {
        auth: {
          user: null,
        },
      },
    });
  });
});
