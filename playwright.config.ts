import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

const E2E_ENV = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://bookhouse:bookhouse@localhost:5432/bookhouse",
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
      testIgnore: /auth-redirect/,
      use: {
        ...devices["Desktop Chrome"],
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
