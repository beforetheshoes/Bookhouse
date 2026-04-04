import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { db } from "@bookhouse/db";
import { createIngestServices } from "../packages/ingest/src/index";
import { cleanTestData, seedLibraryRoot } from "./helpers/seed";

test.describe("Amazon ebook variants", () => {
  let tempDirectory: string | null = null;

  test.afterEach(async () => {
    await cleanTestData();
    if (tempDirectory !== null) {
      await rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = null;
    }
  });

  test("ingests MOBI and AZW as alternate files without duplicates or orphans", async ({ page }) => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "bookhouse-amazon-variants-"));
    const bookDirectory = path.join(tempDirectory, "Patrick Rothfuss", "The Name of the Wind");
    await mkdir(bookDirectory, { recursive: true });
    await writeFile(path.join(bookDirectory, "book.mobi"), "mobi");
    await writeFile(path.join(bookDirectory, "book.azw"), "azw");

    const libraryRoot = await seedLibraryRoot({
      name: "Amazon Variants Library",
      path: tempDirectory,
      kind: "EBOOKS",
      scanMode: "FULL",
    });

    const services = createIngestServices({
      enqueueLibraryJob: async () => undefined,
    });

    const scanResult = await services.scanLibraryRoot({ libraryRootId: libraryRoot.id });
    for (const fileAssetId of scanResult.scannedFileAssetIds) {
      await services.hashFileAsset({ fileAssetId });
      await services.parseFileAssetMetadata({ fileAssetId });
      await services.matchFileAssetToEdition({ fileAssetId });
      await services.detectDuplicates({ fileAssetId });
    }

    const work = await db.work.findFirst({
      where: { titleDisplay: "The Name of the Wind" },
      include: {
        editions: {
          include: {
            editionFiles: {
              include: { fileAsset: true },
            },
          },
        },
      },
    });

    expect(work).not.toBeNull();
    expect(work?.editions).toHaveLength(1);
    expect(work?.editions[0]?.editionFiles).toHaveLength(2);

    await page.goto(`/library/${work?.id}`);
    await expect(page.getByText("book.mobi", { exact: true })).toBeVisible();
    await expect(page.getByText("book.azw", { exact: true })).toBeVisible();

    await page.goto("/duplicates");
    await expect(page.getByText("No duplicates found")).toBeVisible();

    await page.goto("/health");
    await expect(page.getByText("No orphaned files")).toBeVisible();

    const orphanedCount = await db.fileAsset.count({
      where: {
        editionFiles: { none: {} },
        availabilityStatus: "PRESENT",
        mediaKind: { notIn: ["COVER", "SIDECAR"] },
        basename: { notIn: [".DS_Store", "Thumbs.db", "desktop.ini"] },
      },
    });
    expect(orphanedCount).toBe(0);
  });
});
