import { describe, expect, it } from "vitest";
import {
  clearSession,
  createAuthenticatedSession,
  createLoginSession,
} from "./session";

describe("session helpers", () => {
  it("creates a login session", () => {
    expect(
      createLoginSession({
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        returnTo: "/",
      }),
    ).toEqual({
      login: {
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        returnTo: "/",
      },
    });
  });

  it("creates an authenticated session", () => {
    expect(
      createAuthenticatedSession({
        userId: "user-1",
        issuer: "https://issuer.example.com",
        subject: "subject-1",
      }),
    ).toEqual({
      userId: "user-1",
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });
  });

  it("clears the session", () => {
    expect(clearSession()).toEqual({});
  });
});
