import { defineEventHandler } from "h3";
import type { H3Event } from "h3";

export interface OauthAuthorizeHandlerDeps {
  sendRedirect: (event: H3Event, location: string, code: number) => unknown;
}

export function createOauthAuthorizeHandler(deps: OauthAuthorizeHandlerDeps) {
  return (event: H3Event) => {
    const params = event.context.params as Record<string, string>;
    const token = params.token as string;

    // Kobo PKCE flow: redirect to kobo:// deep link so the native app
    // intercepts it and considers authentication complete.
    return deps.sendRedirect(
      event,
      `kobo://UserAuthenticated?code=${token}`,
      302,
    );
  };
}

export function makeOauthResponse(token: string) {
  return {
    access_token: token,
    refresh_token: token,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "",
    user_id: token,
    AccessToken: token,
    RefreshToken: token,
    TokenType: "Bearer",
  };
}

/* c8 ignore start — runtime wiring */
export default defineEventHandler(async (event) => {
  const { sendRedirect } = await import("h3");

  const handler = createOauthAuthorizeHandler({ sendRedirect });
  return handler(event);
});
/* c8 ignore stop */
