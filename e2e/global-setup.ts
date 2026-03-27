import type http from "node:http";
import { startOidcMock } from "./oidc-mock";
import { cleanDatabase } from "./helpers/seed";

let server: http.Server;

export default async function globalSetup() {
  // Start with a clean slate so each test run is fully isolated.
  console.log("[global-setup] Cleaning database...");
  await cleanDatabase().catch((err) => {
    console.error("cleanDatabase failed:", err);
    throw err;
  });
  console.log("[global-setup] Database cleaned.");

  server = await startOidcMock();
  // Store reference for teardown via a global variable — Playwright runs
  // globalSetup and globalTeardown in the same process.
  (globalThis as { __oidcMockServer?: http.Server }).__oidcMockServer = server;
}
