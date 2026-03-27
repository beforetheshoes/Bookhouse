import type http from "node:http";
import { stopOidcMock } from "./oidc-mock";

export default async function globalTeardown() {
  const server = (globalThis as { __oidcMockServer?: http.Server }).__oidcMockServer;

  if (server) {
    await stopOidcMock(server);
  }
}
