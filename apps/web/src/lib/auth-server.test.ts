import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuthenticatedSessionMock = vi.fn();
const createAuthorizationRequestMock = vi.fn();
const clearSessionMock = vi.fn();
const exchangeAuthorizationCodeMock = vi.fn();
const loadAuthConfigMock = vi.fn();
const resolveAuthenticatedUserMock = vi.fn();
const upsertOidcUserMock = vi.fn();
const clearStartSessionMock = vi.fn();
const getRequestMock = vi.fn();
const getRequestUrlMock = vi.fn();
const useSessionMock = vi.fn();

class MockAuthAccessDeniedError extends Error {
  constructor(message = "denied") {
    super(message);
    this.name = "AuthAccessDeniedError";
  }
}

vi.mock("@bookhouse/auth", () => ({
  AuthAccessDeniedError: MockAuthAccessDeniedError,
  OWNER_ROLE: "OWNER",
  VIEWER_ROLE: "VIEWER",
  isOwner: (roles: string[]) => roles.includes("OWNER"),
  createAuthenticatedSession: createAuthenticatedSessionMock,
  createAuthorizationRequest: createAuthorizationRequestMock,
  clearSession: clearSessionMock,
  exchangeAuthorizationCode: exchangeAuthorizationCodeMock,
  loadAuthConfig: loadAuthConfigMock,
  resolveAuthenticatedUser: resolveAuthenticatedUserMock,
  upsertOidcUser: upsertOidcUserMock,
}));

vi.mock("@bookhouse/db", () => ({
  db: {
    user: {},
    $transaction: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: (...args: Array<object>) => object) => fn,
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  clearSession: clearStartSessionMock,
  getRequest: getRequestMock,
  getRequestUrl: getRequestUrlMock,
  useSession: useSessionMock,
}));

describe("auth server helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loadAuthConfigMock.mockReturnValue({
      secret: "a".repeat(32),
      issuer: "https://issuer.example.com",
      clientId: "bookhouse",
      clientSecret: "secret",
      appUrl: "http://localhost:3000",
      scopes: ["openid", "profile", "email"],
    });
  });

  it("starts login and stores the handshake", async () => {
    const update = vi.fn();
    getRequestUrlMock.mockReturnValue(
      new URL("http://localhost:3000/auth/login?returnTo=%2Fbooks"),
    );
    useSessionMock.mockResolvedValue({
      data: {},
      update,
    });
    clearSessionMock.mockReturnValue({});
    createAuthorizationRequestMock.mockResolvedValue({
      authorizationUrl: new URL("https://issuer.example.com/authorize"),
      login: {
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        returnTo: "/books",
      },
    });

    const { handleLoginRequest } = await import("./auth-server");
    const response = await handleLoginRequest();

    expect(createAuthorizationRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      "/books",
    );
    expect(update).toHaveBeenCalledWith({
      login: {
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        returnTo: "/books",
      },
    });
    expect(response.headers.get("location")).toBe(
      "https://issuer.example.com/authorize",
    );
  });

  it("normalizes missing and external return targets", async () => {
    const update = vi.fn();
    useSessionMock.mockResolvedValue({
      data: {},
      update,
    });
    clearSessionMock.mockReturnValue({});
    createAuthorizationRequestMock.mockResolvedValue({
      authorizationUrl: new URL("https://issuer.example.com/authorize"),
      login: {
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        returnTo: "/",
      },
    });

    getRequestUrlMock.mockReturnValue(new URL("http://localhost:3000/auth/login"));
    const { handleLoginRequest, getCurrentUserServerFn } = await import("./auth-server");
    await handleLoginRequest();
    expect(createAuthorizationRequestMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "/",
    );

    getRequestUrlMock.mockReturnValue(
      new URL("http://localhost:3000/auth/login?returnTo=https://evil.example.com"),
    );
    await handleLoginRequest();
    expect(createAuthorizationRequestMock).toHaveBeenLastCalledWith(
      expect.anything(),
      "/",
    );

    resolveAuthenticatedUserMock.mockResolvedValueOnce({ id: "user-1" });
    await expect(getCurrentUserServerFn()).resolves.toEqual({ id: "user-1" });
  });

  it("completes the callback and persists the authenticated session", async () => {
    const update = vi.fn();
    useSessionMock.mockResolvedValue({
      data: {
        login: {
          state: "state",
          nonce: "nonce",
          codeVerifier: "verifier",
          returnTo: "/books",
        },
      },
      update,
    });
    getRequestMock.mockReturnValue({
      url: "http://localhost:3000/auth/callback?code=abc&state=state",
    });
    exchangeAuthorizationCodeMock.mockResolvedValue({
      claims: {
        sub: "subject-1",
      },
    });
    upsertOidcUserMock.mockResolvedValue({
      id: "user-1",
    });
    createAuthenticatedSessionMock.mockReturnValue({
      userId: "user-1",
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });

    const { handleCallbackRequest } = await import("./auth-server");
    const response = await handleCallbackRequest();

    expect(exchangeAuthorizationCodeMock).toHaveBeenCalled();
    expect(upsertOidcUserMock).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      userId: "user-1",
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });
    expect(response.headers.get("location")).toBe("http://localhost:3000/books");
  });

  it("falls back to the home page when the callback handshake has no return target", async () => {
    const update = vi.fn();
    useSessionMock.mockResolvedValue({
      data: {
        login: {
          state: "state",
          nonce: "nonce",
          codeVerifier: "verifier",
        },
      },
      update,
    });
    getRequestMock.mockReturnValue({
      url: "http://localhost:3000/auth/callback?code=abc&state=state",
    });
    exchangeAuthorizationCodeMock.mockResolvedValue({
      claims: {
        sub: "subject-1",
      },
    });
    upsertOidcUserMock.mockResolvedValue({
      id: "user-1",
    });
    createAuthenticatedSessionMock.mockReturnValue({
      userId: "user-1",
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });

    const { handleCallbackRequest } = await import("./auth-server");
    const response = await handleCallbackRequest();

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects to login when the callback has no stored handshake", async () => {
    useSessionMock.mockResolvedValue({
      data: {},
      update: vi.fn(),
    });

    const { handleCallbackRequest } = await import("./auth-server");
    const response = await handleCallbackRequest();

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/login",
    );
  });

  it("clears the local session on logout", async () => {
    const { getAuthSessionConfig, handleLogoutRequest } = await import("./auth-server");
    const response = await handleLogoutRequest();

    expect(clearStartSessionMock).toHaveBeenCalledWith(getAuthSessionConfig());
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/logged-out",
    );
  });

  it("resolves the current user from the session", async () => {
    useSessionMock.mockResolvedValue({
      data: {
        userId: "user-1",
        issuer: "https://issuer.example.com",
        subject: "subject-1",
      },
    });
    resolveAuthenticatedUserMock.mockResolvedValue({
      id: "user-1",
    });

    const { getCurrentUser } = await import("./auth-server");
    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
    });
  });

  it("redirects to /auth/denied when upsertOidcUser throws AuthAccessDeniedError", async () => {
    const update = vi.fn();
    useSessionMock.mockResolvedValue({
      data: {
        login: {
          state: "state",
          nonce: "nonce",
          codeVerifier: "verifier",
          returnTo: "/books",
        },
      },
      update,
    });
    getRequestMock.mockReturnValue({
      url: "http://localhost:3000/auth/callback?code=abc&state=state",
    });
    exchangeAuthorizationCodeMock.mockResolvedValue({
      claims: { sub: "subject-x", email: "noone@example.com" },
    });
    clearSessionMock.mockReturnValue({ cleared: true });
    upsertOidcUserMock.mockRejectedValue(new MockAuthAccessDeniedError("nope"));

    const { handleCallbackRequest } = await import("./auth-server");
    const response = await handleCallbackRequest();

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/denied",
    );
    expect(update).toHaveBeenCalledWith({ cleared: true });
    expect(createAuthenticatedSessionMock).not.toHaveBeenCalled();
  });

  it("propagates non-AuthAccessDeniedError failures from upsertOidcUser", async () => {
    useSessionMock.mockResolvedValue({
      data: {
        login: {
          state: "state",
          nonce: "nonce",
          codeVerifier: "verifier",
          returnTo: "/",
        },
      },
      update: vi.fn(),
    });
    getRequestMock.mockReturnValue({
      url: "http://localhost:3000/auth/callback?code=abc&state=state",
    });
    exchangeAuthorizationCodeMock.mockResolvedValue({
      claims: { sub: "subject-x" },
    });
    upsertOidcUserMock.mockRejectedValue(new Error("db down"));

    const { handleCallbackRequest } = await import("./auth-server");
    await expect(handleCallbackRequest()).rejects.toThrow("db down");
  });

  it("requireAuthenticated returns the current user or throws", async () => {
    useSessionMock.mockResolvedValue({
      data: {
        userId: "user-1",
        issuer: "https://issuer.example.com",
        subject: "subject-1",
      },
    });
    resolveAuthenticatedUserMock.mockResolvedValueOnce({
      id: "user-1",
      roles: ["VIEWER"],
    });
    const { requireAuthenticated, UnauthorizedError } = await import(
      "./auth-server"
    );
    await expect(requireAuthenticated()).resolves.toMatchObject({
      id: "user-1",
    });

    resolveAuthenticatedUserMock.mockResolvedValueOnce(null);
    await expect(requireAuthenticated()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("requireOwner returns the owner user or throws ForbiddenError for non-owners", async () => {
    useSessionMock.mockResolvedValue({
      data: {
        userId: "user-1",
        issuer: "https://issuer.example.com",
        subject: "subject-1",
      },
    });
    resolveAuthenticatedUserMock.mockResolvedValueOnce({
      id: "user-1",
      roles: ["OWNER"],
    });
    const { requireOwner, ForbiddenError } = await import("./auth-server");
    await expect(requireOwner()).resolves.toMatchObject({
      id: "user-1",
      roles: ["OWNER"],
    });

    resolveAuthenticatedUserMock.mockResolvedValueOnce({
      id: "user-2",
      roles: ["VIEWER"],
    });
    await expect(requireOwner()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
