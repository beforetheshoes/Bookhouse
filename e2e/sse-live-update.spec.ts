import { test, expect } from "@playwright/test";
import { seedLibraryRoot, cleanTestData } from "./helpers/seed";
import path from "node:path";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures/library");

test.describe("SSE live update", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("new works appear in library without page reload after scan", async ({
    page,
  }) => {
    // Seed a library root with the test EPUB fixture.
    await seedLibraryRoot({
      name: "SSE Test Library",
      path: FIXTURES_DIR,
    });

    // Navigate to the library page — should show empty state initially.
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

    // Open settings in a new tab to trigger the scan.
    const settingsPage = await page.context().newPage();
    await settingsPage.goto("/settings/libraries");
    await settingsPage.getByRole("button", { name: "Scan Now" }).click();

    // Wait for the scan to start.
    await expect(settingsPage.getByText(/Scan started/)).toBeVisible({
      timeout: 10_000,
    });

    // Back on the library page, the scanning indicator should appear via SSE.
    await expect(page.getByText(/Scanning/)).toBeVisible({ timeout: 15_000 });

    // Wait for the scan to complete and new works to appear.
    // The worker processes the test EPUB and the SSE event triggers a
    // router.invalidate() which refreshes the data.
    await expect(page.getByText("E2E Test Book")).toBeVisible({
      timeout: 60_000,
    });

    await settingsPage.close();
  });
});
