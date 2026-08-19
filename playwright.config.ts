import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

const E2E_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://bookhouse:bookhouse@localhost:5432/bookhouse_test",
  QUEUE_URL: process.env.QUEUE_URL ?? "redis://localhost:6379",
  AUTH_SECRET: "e2e-test-secret-at-least-32-chars!!",
  AUTH_OIDC_ISSUER: "http://localhost:9090",
  AUTH_OIDC_CLIENT_ID: "e2e-client",
  AUTH_OIDC_CLIENT_SECRET: "e2e-secret",
  APP_URL: "http://localhost:3000",
};

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Stop early in CI if many tests fail rather than burning the whole job
  // budget on retries (0 = unlimited, used locally).
  maxFailures: CI ? 5 : 0,
  workers: 1,
  reporter: CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "unauthenticated",
      testMatch: /auth-redirect/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /auth-redirect|mobile\.spec|touch-band\.spec/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
      },
      dependencies: ["auth-setup"],
    },
    {
      // The touch band. 768 and 1023 are iPad-portrait territory: hover is
      // unavailable but the layout has crossed md, and the suite previously
      // asserted things about this band without ever rendering it.
      name: "tablet-chrome",
      testMatch: /touch-band\.spec\.ts/,
      use: {
        // Chromium with touch, not a WebKit iPad profile - only Chromium is
        // installed here, and the spec sets the exact widths it needs.
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        isMobile: false,
        storageState: "e2e/.auth/state.json",
      },
      dependencies: ["auth-setup"],
    },
    {
      // Scoped to e2e/mobile.spec.ts only. The other specs assert data flows,
      // not layout, and `workers: 1` makes a full second pass expensive.
      // Galaxy S8 is 360px wide — the harshest viewport we support.
      name: "mobile-chrome",
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["Galaxy S8"],
        storageState: "e2e/.auth/state.json",
      },
      dependencies: ["auth-setup"],
    },
  ],

  webServer: CI
    ? undefined
    : {
        command: "node apps/web/.output/server/index.mjs",
        port: 3000,
        reuseExistingServer: true,
        env: E2E_ENV,
      },
});
