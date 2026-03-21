import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

test.describe("Library page", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("renders empty state when no works exist", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.getByText("No works yet")).toBeVisible();
  });

  test("renders works table when works exist", async ({ page }) => {
    await seedWork({ title: "The Great Gatsby" });

    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.getByText("The Great Gatsby")).toBeVisible();
  });
});
