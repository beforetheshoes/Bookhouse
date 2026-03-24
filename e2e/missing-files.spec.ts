import { test, expect } from "@playwright/test";
import { cleanTestData } from "./helpers/seed";
import { db } from "@bookhouse/db";

async function seedMissingFile(title: string) {
  const libraryRoot = await db.libraryRoot.upsert({
    where: { path: "/tmp/e2e-missing-library" },
    create: { name: "E2E Missing Library", path: "/tmp/e2e-missing-library", kind: "EBOOKS", scanMode: "FULL" },
    update: {},
  });

  const slug = title.toLowerCase().replace(/\s+/g, "-");

  return db.work.create({
    data: {
      titleCanonical: title.toLowerCase(),
      titleDisplay: title,
      sortTitle: title.toLowerCase(),
      editions: {
        create: {
          formatFamily: "EBOOK",
          editionFiles: {
            create: {
              role: "PRIMARY",
              fileAsset: {
                create: {
                  libraryRootId: libraryRoot.id,
                  absolutePath: `/tmp/e2e-missing-library/${slug}.epub`,
                  relativePath: `${slug}.epub`,
                  basename: `${slug}.epub`,
                  extension: "epub",
                  mediaKind: "EPUB",
                  availabilityStatus: "MISSING",
                },
              },
            },
          },
        },
      },
    },
  });
}

test.describe("Missing files review page", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("shows missing files with file path and work title", async ({ page }) => {
    await seedMissingFile("Missing Book");

    await page.goto("/settings/missing-files");

    await expect(page.getByRole("heading", { name: "Missing Files" })).toBeVisible();
    await expect(page.getByText("missing-book.epub")).toBeVisible();
    await expect(page.getByText("Missing Book")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clean Up All" })).toBeVisible();
  });

  test("opens cleanup confirmation dialog", async ({ page }) => {
    await seedMissingFile("Dialog Test Book");

    await page.goto("/settings/missing-files");
    await expect(page.getByText("dialog-test-book.epub")).toBeVisible();

    await page.getByRole("button", { name: "Clean Up All" }).click();

    await expect(page.locator("[role='dialog']")).toBeVisible();
    await expect(page.getByText(/will remove all missing files/)).toBeVisible();
  });

  test("shows empty state when no missing files", async ({ page }) => {
    await page.goto("/settings/missing-files");
    await expect(page.getByText("No missing files found.")).toBeVisible();
  });

  test("back link navigates to libraries settings", async ({ page }) => {
    await page.goto("/settings/missing-files");
    await page.getByText("Back to Libraries").click();
    await expect(page).toHaveURL(/settings\/libraries/);
  });
});
