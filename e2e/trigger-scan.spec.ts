import { test, expect } from "@playwright/test";
import { seedLibraryRoot, cleanTestData } from "./helpers/seed";
import path from "node:path";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures/library");

test.describe("Trigger scan", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("clicking Scan Now shows scanning indicator then completes", async ({
    page,
  }) => {
    // Seed a library root pointing to the fixtures directory with a test EPUB.
    await seedLibraryRoot({
      name: "Scan Test Library",
      path: FIXTURES_DIR,
    });

    await page.goto("/settings/libraries");

    await expect(page.getByText("Scan Test Library")).toBeVisible();

    // Click the Scan Now button.
    await page.getByRole("button", { name: "Scan Now" }).click();

    // A toast should confirm the scan was started.
    await expect(page.getByText(/Scan started/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
