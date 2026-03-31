import { describe, it, expect } from "vitest";
import { createOidcDiscoveryHandler } from "./openid-configuration";
import type { H3Event } from "h3";

describe("OIDC discovery handler", () => {
  const deps = { getBaseUrl: () => "http://192.168.1.10:3000" };

  function makeEvent(token = "abc123"): H3Event {
    return { context: { params: { token } } } as unknown as H3Event;
  }

  it("returns discovery document with token-scoped URLs", () => {
    const handler = createOidcDiscoveryHandler(deps);
    const result = handler(makeEvent());

    expect(result.issuer).toBe("http://192.168.1.10:3000/kobo/abc123/oauth");
    expect(result.authorization_endpoint).toBe("http://192.168.1.10:3000/kobo/abc123/oauth/authorize");
    expect(result.token_endpoint).toBe("http://192.168.1.10:3000/kobo/abc123/oauth/token");
    expect(result.userinfo_endpoint).toBe("http://192.168.1.10:3000/kobo/abc123/oauth/userinfo");
    expect(result.end_session_endpoint).toBe("http://192.168.1.10:3000/kobo/abc123/oauth/logout");
  });
});
