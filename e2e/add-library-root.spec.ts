import { test, expect } from "@playwright/test";
import { cleanTestData } from "./helpers/seed";

test.describe("Add library root", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("fills and submits the add library root form", async ({ page }) => {
    await page.goto("/settings/libraries");

    await expect(
      page.getByRole("heading", { name: "Library Roots" }),
    ).toBeVisible();

    // Open the dialog
    await page.getByRole("button", { name: /Add Library Root/i }).click();

    // Fill the form
    await page.getByLabel("Name").fill("My Test Library");
    await page.getByLabel("Path").fill("/tmp/e2e-add-root-test");

    // Submit
    await page.getByRole("button", { name: /Add$/i }).click();

    // The new library root should appear on the page
    await expect(page.getByText("My Test Library")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("/tmp/e2e-add-root-test")).toBeVisible();
  });
});
