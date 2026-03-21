import { test, expect } from "@playwright/test";
import { seedLibraryRoot, seedImportJob, cleanTestData } from "./helpers/seed";

test.describe("Jobs page", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("renders job list with status badges", async ({ page }) => {
    const root = await seedLibraryRoot();
    await seedImportJob(root.id, { status: "SUCCEEDED" });
    await seedImportJob(root.id, { status: "FAILED" });

    await page.goto("/settings/jobs");

    await expect(
      page.getByRole("heading", { name: "Import Jobs" }),
    ).toBeVisible();
    await expect(page.getByText("SUCCEEDED").first()).toBeVisible();
    await expect(page.getByText("FAILED").first()).toBeVisible();
  });

  test("shows job detail page", async ({ page }) => {
    const root = await seedLibraryRoot();
    const job = await seedImportJob(root.id, { status: "SUCCEEDED" });

    await page.goto(`/settings/jobs/${job.id}`);

    await expect(page.getByText("SUCCEEDED")).toBeVisible();
    await expect(page.getByText("SCAN ROOT")).toBeVisible();
  });
});
