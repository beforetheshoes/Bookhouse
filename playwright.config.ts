import { defineConfig, devices } from "@playwright/test";

const port = 3010;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./apps/web/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: [
      "AUTH_SECRET=0123456789abcdef0123456789abcdef",
      "AUTH_OIDC_ISSUER=https://example.com",
      "AUTH_OIDC_CLIENT_ID=bookhouse-e2e",
      "AUTH_OIDC_CLIENT_SECRET=bookhouse-e2e-secret",
      `APP_URL=${baseURL}`,
      "BOOKHOUSE_E2E_FIXTURES=1",
      "pnpm --filter @bookhouse/web exec vite dev --host 127.0.0.1 --port 3010",
    ].join(" "),
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
