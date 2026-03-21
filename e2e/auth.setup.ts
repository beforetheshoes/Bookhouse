import { test as setup } from "@playwright/test";

setup("authenticate", async ({ page }) => {
  // Navigate to a protected route — the app redirects to /auth/login,
  // which redirects to the OIDC mock, which auto-approves, then
  // redirects back to /auth/callback, creating a session cookie.
  await page.goto("/library");

  // Wait for the auth flow to complete and land on the library page.
  await page.waitForURL("**/library**", { timeout: 30_000 });

  // Save the authenticated browser state for reuse by other tests.
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});
