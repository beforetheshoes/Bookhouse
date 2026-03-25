import { test, expect } from "@playwright/test";
import { seedLibraryRoot, cleanTestData } from "./helpers/seed";
import { db } from "@bookhouse/db";

test.describe("Library root removal with orphan cleanup", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("removing a library root cleans up orphaned works", async ({ page }) => {
    const root = await seedLibraryRoot({ name: "Removable Library" });
    await db.work.create({
      data: {
        titleCanonical: "orphan book",
        titleDisplay: "Orphan Book",
        sortTitle: "orphan book",
        editions: {
          create: {
            formatFamily: "EBOOK",
            editionFiles: {
              create: {
                role: "PRIMARY",
                fileAsset: {
                  create: {
                    libraryRootId: root.id,
                    absolutePath: "/tmp/e2e-test-library/orphan.epub",
                    relativePath: "orphan.epub",
                    basename: "orphan.epub",
                    extension: "epub",
                    mediaKind: "EPUB",
                    availabilityStatus: "PRESENT",
                  },
                },
              },
            },
          },
        },
      },
    });

    // Verify work exists
    await page.goto("/library");
    await expect(page.getByText("Orphan Book")).toBeVisible({ timeout: 10_000 });

    // Go to settings and wait for the page to fully load
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.waitForSelector("text=Removable Library", { timeout: 15_000 });

    // Click trash and confirm
    await page.locator("svg.lucide-trash-2").click();
    await expect(page.getByText("Remove Library Root")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();

    // Wait for removal toast
    await expect(page.getByText(/removed/i)).toBeVisible({ timeout: 15_000 });

    // Verify orphaned work is gone (orphan cleanup may run asynchronously)
    await page.goto("/library");
    await expect(page.getByText("Orphan Book")).not.toBeVisible({ timeout: 15_000 });
  });
});
