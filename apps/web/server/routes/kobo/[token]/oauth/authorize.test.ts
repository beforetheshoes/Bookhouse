import { describe, it, expect, vi } from "vitest";
import { createOauthAuthorizeHandler, makeOauthResponse } from "./authorize";
import type { H3Event } from "h3";

describe("createOauthAuthorizeHandler", () => {
  it("redirects to kobo://UserAuthenticated with code=token", () => {
    const mockSendRedirect = vi.fn().mockReturnValue(undefined);
    const handler = createOauthAuthorizeHandler({ sendRedirect: mockSendRedirect });
    const event = { context: { params: { token: "abc123" } } } as unknown as H3Event;

    handler(event);

    expect(mockSendRedirect).toHaveBeenCalledWith(
      event,
      "kobo://UserAuthenticated?code=abc123",
      302,
    );
  });
});

describe("makeOauthResponse", () => {
  it("includes both camelCase and PascalCase fields", () => {
    const result = makeOauthResponse("tok");
    expect(result.access_token).toBe("tok");
    expect(result.AccessToken).toBe("tok");
    expect(result.scope).toBe("");
    expect(result.user_id).toBe("tok");
  });
});
