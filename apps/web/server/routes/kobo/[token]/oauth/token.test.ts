import { describe, it, expect } from "vitest";
import { createOauthTokenHandler } from "./token";
import type { H3Event } from "h3";

describe("createOauthTokenHandler", () => {
  it("returns OAuth token response using the device token", () => {
    const handler = createOauthTokenHandler();
    const event = { context: { params: { token: "abc123" } } } as unknown as H3Event;
    const result = handler(event);

    expect(result.access_token).toBe("abc123");
    expect(result.AccessToken).toBe("abc123");
    expect(result.user_id).toBe("abc123");
    expect(result.expires_in).toBe(3600);
  });
});
