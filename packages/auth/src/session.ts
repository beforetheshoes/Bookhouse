import type { AuthLoginState, AuthSessionData } from "./types";

export function createLoginSession(login: AuthLoginState): AuthSessionData {
  return {
    login,
  };
}

export function createAuthenticatedSession(input: {
  userId: string;
  issuer: string;
  subject: string;
}): AuthSessionData {
  return {
    userId: input.userId,
    issuer: input.issuer,
    subject: input.subject,
  };
}

export function clearSession(): AuthSessionData {
  return {};
}
