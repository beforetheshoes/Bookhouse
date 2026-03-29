import path from "node:path";
import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

test.describe("Backup and restore", () => {
  let tempBackupPath: string | null = null;

  test.afterEach(async () => {
    await cleanTestData();
    if (tempBackupPath) {
      await fs.rm(tempBackupPath, { force: true });
      tempBackupPath = null;
    }
  });

  test("creates a backup and restores data after wipe", async ({ page }) => {
    await seedWork({ title: "Backup Round-Trip Book" });

    await page.goto("/settings");
    await page.getByRole("tab", { name: "Backup" }).click();

    // Create backup — wait for the file download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /create backup/i }).click();
    const download = await downloadPromise;

    tempBackupPath = path.join("/tmp", `e2e-backup-${String(Date.now())}.tar.gz`);
    await download.saveAs(tempBackupPath);

    // Backup success toast confirms completion
    await expect(page.getByText(/backup created successfully/i)).toBeVisible({ timeout: 10_000 });

    // Wipe library data to simulate data loss
    await cleanTestData();

    await page.goto("/library");
    await expect(page.getByText("No works yet")).toBeVisible();

    // Navigate to backup tab and restore
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Backup" }).click();

    await page.getByTestId("restore-file-input").setInputFiles(tempBackupPath);
    await expect(page.getByText(/overwrite all current data/i)).toBeVisible();
    await page.locator("[role='dialog'] button", { hasText: /^restore$/i }).click();

    // Wait for restore to complete (includes pg_dump + psql round-trip)
    await expect(page.getByText(/backup restored successfully/i)).toBeVisible({ timeout: 30_000 });

    // Wait for the automatic page reload
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Verify the work is back
    await page.goto("/library");
    await expect(page.getByText("Backup Round-Trip Book")).toBeVisible({ timeout: 15_000 });
  });
});
