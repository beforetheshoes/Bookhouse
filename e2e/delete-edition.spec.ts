import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";
import { db } from "@bookhouse/db";

test.describe("Delete edition from work detail page", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("deleting the last edition also removes the work", async ({ page }) => {
    await seedWork({ title: "Single Edition Book" });

    await page.goto("/library");
    await page.getByText("Single Edition Book").click();
    await expect(page.locator("h1")).toContainText("Single Edition Book");

    // Open the edition kebab menu, then click Delete Edition
    await page.getByLabel("Edition actions").first().click();
    await page.locator("[data-testid^='delete-edition-']").first().click();

    // Confirmation dialog
    await expect(page.locator("[role='dialog']").getByText("Delete Edition")).toBeVisible();

    // Confirm
    await page.locator("[role='dialog'] button", { hasText: "Delete" }).click();

    // Should redirect to library since work was also removed
    await expect(page).toHaveURL(/\/library/, { timeout: 10_000 });
  });

  test("deleting one edition of multiple keeps the work", async ({ page }) => {
    // Create work with two editions
    const work = await seedWork({ title: "Multi Edition Book" });
    const libraryRoot = await db.libraryRoot.findFirst();
    if (!libraryRoot) throw new Error("expected library root");
    await db.edition.create({
      data: {
        workId: work.id,
        formatFamily: "AUDIOBOOK",
        editionFiles: {
          create: {
            role: "PRIMARY",
            fileAsset: {
              create: {
                libraryRootId: libraryRoot.id,
                absolutePath: "/tmp/e2e-seed-library/multi-edition-book.m4b",
                relativePath: "multi-edition-book.m4b",
                basename: "multi-edition-book.m4b",
                extension: "m4b",
                mediaKind: "AUDIO",
                availabilityStatus: "PRESENT",
              },
            },
          },
        },
      },
    });

    await page.goto("/library");
    await page.getByText("Multi Edition Book").click();
    await expect(page.locator("h1")).toContainText("Multi Edition Book");

    // Should see both formats
    await expect(page.getByText("EBOOK").first()).toBeVisible();
    await expect(page.getByText("AUDIOBOOK").first()).toBeVisible();

    // Open the edition kebab menu, then click Delete Edition
    await page.getByLabel("Edition actions").first().click();
    await page.locator("[data-testid^='delete-edition-']").first().click();
    await expect(page.locator("[role='dialog']").getByText("Delete Edition")).toBeVisible();
    await page.locator("[role='dialog'] button", { hasText: "Delete" }).click();

    // Work should still exist
    await expect(page.locator("h1")).toContainText("Multi Edition Book", { timeout: 10_000 });
  });
});
