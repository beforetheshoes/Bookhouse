import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

test.describe("Mark works as read", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("marking read from the detail page finishes the work", async ({ page }) => {
    const work = await seedWork({ title: "Detail Read Book" });

    await page.goto(`/library/${work.id}`);

    const strip = page.getByTestId("reading-progress-strip");
    await expect(strip).toContainText("0%");

    await page.getByTestId("mark-work-read-btn").click();

    // The strip reflects the new progress once the route data reloads, and the
    // button settles into its already-finished state.
    await expect(strip).toContainText("100%", { timeout: 10_000 });
    await expect(page.getByTestId("mark-work-read-btn")).toBeDisabled();
  });

  test("bulk marking read from the library finishes every selected work", async ({ page }) => {
    const alpha = await seedWork({ title: "Bulk Read Alpha" });
    const beta = await seedWork({ title: "Bulk Read Beta" });

    await page.goto("/library");
    await expect(page.getByText("Bulk Read Alpha")).toBeVisible();

    const tableButton = page.getByRole("button", { name: /table/i });
    if (await tableButton.isVisible()) {
      await tableButton.click();
    }

    // First checkbox is select-all, so it covers both seeded works.
    await page.getByRole("checkbox").first().click();
    await expect(page.getByText(/works selected/)).toBeVisible();

    await page.getByTestId("bulk-mark-read-btn").click();

    await expect(page.getByText(/marked as read/)).toBeVisible({ timeout: 10_000 });

    // Both works persisted at 100%, which is the "finished" bucket the
    // library's reading filter uses.
    for (const work of [alpha, beta]) {
      await page.goto(`/library/${work.id}`);
      await expect(page.getByTestId("reading-progress-strip")).toContainText("100%", { timeout: 10_000 });
    }
  });
});
