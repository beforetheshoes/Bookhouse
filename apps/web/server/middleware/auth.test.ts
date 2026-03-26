import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSessionData, AuthenticatedUser } from "@bookhouse/auth";
import type { H3Event } from "h3";
import { createAuthMiddleware, type AuthMiddlewareDeps } from "./auth";

function createMockDeps(
  overrides: Partial<AuthMiddlewareDeps> = {},
): AuthMiddlewareDeps {
  return {
    getSession: vi.fn().mockResolvedValue({ data: {} }),
    resolveUser: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createMockEvent(pathname: string): H3Event {
  return {
    path: pathname,
  } as unknown as H3Event;
}

const validUser: AuthenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  image: null,
  issuer: "https://issuer.example.com",
  subject: "sub-123",
};

const validSessionData: Partial<AuthSessionData> = {
  userId: "user-1",
  issuer: "https://issuer.example.com",
  subject: "sub-123",
};

describe("createAuthMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when session has no data", async () => {
    const deps = createMockDeps();
    const middleware = createAuthMiddleware(deps);

    await expect(middleware(createMockEvent("/api/events"))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  });

  it("returns 401 when resolveUser returns null", async () => {
    const deps = createMockDeps({
      getSession: vi.fn().mockResolvedValue({ data: validSessionData }),
      resolveUser: vi.fn().mockResolvedValue(null),
    });
    const middleware = createAuthMiddleware(deps);

    await expect(middleware(createMockEvent("/api/events"))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: "Unauthorized",
    });
  });

  it("passes session data to resolveUser", async () => {
    const resolveUser = vi.fn().mockResolvedValue(validUser);
    const deps = createMockDeps({
      getSession: vi.fn().mockResolvedValue({ data: validSessionData }),
      resolveUser,
    });
    const middleware = createAuthMiddleware(deps);

    await middleware(createMockEvent("/api/upload-cover/work-1"));

    expect(resolveUser).toHaveBeenCalledWith(validSessionData);
  });

  it("does not throw when user is authenticated", async () => {
    const deps = createMockDeps({
      getSession: vi.fn().mockResolvedValue({ data: validSessionData }),
      resolveUser: vi.fn().mockResolvedValue(validUser),
    });
    const middleware = createAuthMiddleware(deps);

    await expect(
      middleware(createMockEvent("/api/covers/work-1/small")),
    ).resolves.toBeUndefined();
  });

  it("skips auth for non-API paths", async () => {
    const deps = createMockDeps();
    const middleware = createAuthMiddleware(deps);

    await expect(
      middleware(createMockEvent("/auth/login")),
    ).resolves.toBeUndefined();

    expect(deps.getSession).not.toHaveBeenCalled();
    expect(deps.resolveUser).not.toHaveBeenCalled();
  });

  it("skips auth for root path", async () => {
    const deps = createMockDeps();
    const middleware = createAuthMiddleware(deps);

    await expect(
      middleware(createMockEvent("/")),
    ).resolves.toBeUndefined();

    expect(deps.getSession).not.toHaveBeenCalled();
  });

  it("calls getSession with the event", async () => {
    const getSession = vi.fn().mockResolvedValue({ data: validSessionData });
    const deps = createMockDeps({
      getSession,
      resolveUser: vi.fn().mockResolvedValue(validUser),
    });
    const middleware = createAuthMiddleware(deps);
    const event = createMockEvent("/api/events");

    await middleware(event);

    expect(getSession).toHaveBeenCalledWith(event);
  });
});
