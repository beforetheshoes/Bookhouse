import { test, expect } from "@playwright/test";
import { cleanTestData } from "./helpers/seed";
import { db } from "@bookhouse/db";

test.describe("Missing file behavior setting", () => {
  test.afterEach(async () => {
    await cleanTestData();
    // Clean up the setting
    await db.appSetting.deleteMany({ where: { key: "missingFileBehavior" } });
  });

  test("renders missing file behavior setting with manual as default", async ({ page }) => {
    await page.goto("/settings/libraries");

    await expect(page.getByText("Missing File Behavior")).toBeVisible();
    await expect(page.getByText("Manual review")).toBeVisible();
    await expect(page.getByText("Auto-cleanup during scan")).toBeVisible();

    // Manual should be selected by default
    const manualRadio = page.getByRole("radio", { name: /manual/i }).or(page.locator("input[value='manual']"));
    await expect(manualRadio).toBeChecked();
  });

  test("changing to auto-cleanup persists the setting", async ({ page }) => {
    await page.goto("/settings/libraries");

    // Click auto-cleanup
    await page.locator("input[value='auto-cleanup']").click();

    // Should show success toast
    await expect(page.getByText(/behavior updated/)).toBeVisible({ timeout: 5_000 });

    // Reload and verify
    await page.reload();
    await expect(page.locator("input[value='auto-cleanup']")).toBeChecked();
  });
});
