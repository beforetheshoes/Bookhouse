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
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Remove Library Root")).toBeVisible();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();

    // Wait for the removal toast, by its exact text and inside the toaster.
    // `getByText(/removed/i)` matched a static paragraph on this very page -
    // "Missing files and their library entries are automatically removed" - so
    // it resolved instantly and this step waited for nothing at all. The
    // deletion had not necessarily even started.
    await expect(
      page.locator("[data-sonner-toast]").getByText('"Removable Library" removed'),
    ).toBeVisible({ timeout: 15_000 });

    // The database is the fact; the page is a view of it.
    expect(await db.libraryRoot.count()).toBe(0);
    expect(await db.work.count({ where: { titleDisplay: "Orphan Book" } })).toBe(0);
    expect(await db.fileAsset.count()).toBe(0);

    // Verify orphaned work is gone (orphan cleanup may run asynchronously)
    await page.goto("/library");
    await expect(page.getByText("Orphan Book")).not.toBeVisible({ timeout: 15_000 });
  });
});
