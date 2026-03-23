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
    await expect(page.getByRole("heading", { level: 1, name: "Single Edition Book" })).toBeVisible();

    // Find the edition delete button (second trash icon — first is work delete)
    const trashButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    // The edition delete button is inside the edition card
    const editionCard = page.locator("[data-slot='card']").first();
    const editionDeleteBtn = editionCard.getByRole("button");
    await editionDeleteBtn.click();

    // Confirmation dialog
    await expect(page.getByText("Delete Edition")).toBeVisible();
    await expect(page.getByText(/last edition/)).toBeVisible();

    // Confirm
    await page.getByRole("button", { name: "Delete" }).click();

    // Should redirect to library since work was also removed
    await expect(page.getByText("Single Edition Book")).not.toBeVisible({ timeout: 10_000 });
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
    await expect(page.getByRole("heading", { level: 1, name: "Multi Edition Book" })).toBeVisible();

    // Should see two edition cards
    await expect(page.getByText("EBOOK")).toBeVisible();
    await expect(page.getByText("AUDIOBOOK")).toBeVisible();

    // Delete the first edition (EBOOK)
    const firstEditionCard = page.locator("[data-slot='card']").first();
    await firstEditionCard.getByRole("button").click();

    await expect(page.getByText("Delete Edition")).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();

    // Work should still exist, AUDIOBOOK edition should remain
    await expect(page.getByRole("heading", { level: 1, name: "Multi Edition Book" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("AUDIOBOOK")).toBeVisible();
  });
});
