import { test, expect } from "@playwright/test";
import { seedLibraryRoot, seedWork, cleanTestData } from "./helpers/seed";
import { db } from "@bookhouse/db";

test.describe("Library root removal with orphan cleanup", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("removing a library root cleans up orphaned works", async ({ page }) => {
    // Seed a library root with a work
    await seedWork({ title: "Orphan Candidate" });

    await page.goto("/settings/libraries");
    await expect(page.getByText("E2E Seed Library")).toBeVisible();

    // Verify work exists in library
    await page.goto("/library");
    await expect(page.getByText("Orphan Candidate")).toBeVisible();

    // Go back to settings and remove the library root
    await page.goto("/settings/libraries");

    // Click the delete/trash button
    const trashButton = page.getByRole("button").filter({ has: page.locator("svg.lucide-trash-2") });
    await trashButton.click();

    // Confirmation dialog
    await expect(page.getByText("Remove Library Root")).toBeVisible();
    await expect(page.getByText(/files on disk will not be affected/)).toBeVisible();

    // Confirm
    await page.getByRole("button", { name: "Remove" }).click();

    // Wait for removal
    await expect(page.getByText(/removed/)).toBeVisible({ timeout: 10_000 });

    // Verify work is gone from library
    await page.goto("/library");
    await expect(page.getByText("Orphan Candidate")).not.toBeVisible();
  });

  test("removing a library root keeps works that have editions from other roots", async ({ page }) => {
    // Create two library roots
    const root1 = await seedLibraryRoot({ name: "Root One", path: "/tmp/e2e-root-one" });
    const root2 = await seedLibraryRoot({ name: "Root Two", path: "/tmp/e2e-root-two" });

    // Create a work with editions from both roots
    const work = await db.work.create({
      data: {
        titleCanonical: "shared book",
        titleDisplay: "Shared Book",
        sortTitle: "shared book",
        editions: {
          create: [
            {
              formatFamily: "EBOOK",
              editionFiles: {
                create: {
                  role: "PRIMARY",
                  fileAsset: {
                    create: {
                      libraryRootId: root1.id,
                      absolutePath: "/tmp/e2e-root-one/shared.epub",
                      relativePath: "shared.epub",
                      basename: "shared.epub",
                      extension: "epub",
                      mediaKind: "EPUB",
                      availabilityStatus: "PRESENT",
                    },
                  },
                },
              },
            },
            {
              formatFamily: "AUDIOBOOK",
              editionFiles: {
                create: {
                  role: "PRIMARY",
                  fileAsset: {
                    create: {
                      libraryRootId: root2.id,
                      absolutePath: "/tmp/e2e-root-two/shared.m4b",
                      relativePath: "shared.m4b",
                      basename: "shared.m4b",
                      extension: "m4b",
                      mediaKind: "AUDIO",
                      availabilityStatus: "PRESENT",
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });

    await page.goto("/settings/libraries");

    // Remove Root One
    const rootOneCard = page.locator("text=Root One").locator("..");
    const trashButtons = page.getByRole("button").filter({ has: page.locator("svg.lucide-trash-2") });
    await trashButtons.first().click();
    await expect(page.getByText("Remove Library Root")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(/removed/)).toBeVisible({ timeout: 10_000 });

    // Work should still exist with audiobook edition
    await page.goto("/library");
    await expect(page.getByText("Shared Book")).toBeVisible();
  });
});
