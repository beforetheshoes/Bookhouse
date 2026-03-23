import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

test.describe("Delete work from detail page", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("deleting a work removes it and redirects to library", async ({ page }) => {
    await seedWork({ title: "Deletable Book" });

    await page.goto("/library");
    await expect(page.getByText("Deletable Book")).toBeVisible();

    // Navigate to work detail
    await page.getByText("Deletable Book").click();
    await expect(page.getByRole("heading", { level: 1, name: "Deletable Book" })).toBeVisible();

    // Click the delete button (Trash2 icon button next to title)
    const deleteButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    await deleteButtons.first().click();

    // Confirmation dialog appears
    await expect(page.getByText("Delete Work")).toBeVisible();
    await expect(page.getByText(/will remove.*Deletable Book/)).toBeVisible();
    await expect(page.getByText(/files on disk will not be affected/)).toBeVisible();

    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();

    // Should redirect to library and book should be gone
    await expect(page.getByText("Deletable Book")).not.toBeVisible({ timeout: 10_000 });
  });

  test("cancelling delete work dialog does not remove the work", async ({ page }) => {
    await seedWork({ title: "Keep This Book" });

    await page.goto("/library");
    await page.getByText("Keep This Book").click();
    await expect(page.getByRole("heading", { level: 1, name: "Keep This Book" })).toBeVisible();

    // Open delete dialog
    const deleteButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    await deleteButtons.first().click();
    await expect(page.getByText("Delete Work")).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Work should still be visible
    await expect(page.getByRole("heading", { level: 1, name: "Keep This Book" })).toBeVisible();
  });
});
