import type http from "node:http";
import { stopOidcMock } from "./oidc-mock";

export default async function globalTeardown() {
  const server = (globalThis as Record<string, unknown>).__oidcMockServer as
    | http.Server
    | undefined;

  if (server) {
    await stopOidcMock(server);
  }
}
