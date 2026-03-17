export interface AuthConfig {
  secret: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  scopes: string[];
}

export interface AuthLoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export interface AuthSessionData {
  userId?: string;
  issuer?: string;
  subject?: string;
  login?: AuthLoginState;
}

export interface NormalizedOidcClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  preferredUsername: string | null;
  image: string | null;
  raw: Record<string, unknown>;
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  issuer: string;
  subject: string;
}

export interface AuthorizationRequestResult {
  authorizationUrl: URL;
  login: AuthLoginState;
}

export interface CompletedLoginResult {
  user: AuthenticatedUser;
  session: AuthSessionData;
  endSessionUrl: string | null;
}

export const AUTH_TYPES = "auth-types";
