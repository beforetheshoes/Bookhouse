import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

test.describe("Bulk delete works from library", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("selecting works shows action bar and bulk delete removes them", async ({ page }) => {
    await seedWork({ title: "Book Alpha" });
    await seedWork({ title: "Book Beta" });

    await page.goto("/library");
    await expect(page.getByText("Book Alpha")).toBeVisible();
    await expect(page.getByText("Book Beta")).toBeVisible();

    // Switch to table view if not already (table view has checkboxes)
    const tableButton = page.getByRole("button", { name: /table/i });
    if (await tableButton.isVisible()) {
      await tableButton.click();
    }

    // Select the first row checkbox
    const checkboxes = page.getByRole("checkbox");
    // First is select-all, subsequent are rows
    await checkboxes.nth(1).click();

    // Action bar should appear
    await expect(page.getByText(/1 work selected/)).toBeVisible();
    await expect(page.getByTestId("bulk-delete-works-btn")).toBeVisible();

    // Click Delete button
    await page.getByTestId("bulk-delete-works-btn").click();

    // Confirmation dialog
    await expect(page.getByText(/will remove 1 work/)).toBeVisible();

    // Confirm via the dialog's Delete button (inside the dialog, not the toolbar)
    await page.locator("[role='dialog'] button", { hasText: /^Delete$/ }).click();

    // Toast should confirm
    await expect(page.getByText(/deleted/i)).toBeVisible({ timeout: 10_000 });
  });

  test("clear button deselects all rows", async ({ page }) => {
    await seedWork({ title: "Clearable Book" });

    await page.goto("/library");

    const tableButton = page.getByRole("button", { name: /table/i });
    if (await tableButton.isVisible()) {
      await tableButton.click();
    }

    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(1).click();

    await expect(page.getByText(/1 work selected/)).toBeVisible();

    // Click Clear button
    await page.getByRole("button", { name: "Clear" }).click();

    // Action bar should disappear
    await expect(page.getByText(/work selected/)).not.toBeVisible();
  });
});
