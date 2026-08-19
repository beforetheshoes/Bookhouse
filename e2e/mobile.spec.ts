import { test, expect, type Page } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

/**
 * Asserts the document does not scroll horizontally.
 *
 * This is the assertion happy-dom fundamentally cannot make: it performs no
 * layout, so unit tests can only prove a responsive class is *present*, never
 * that it *works*. A horizontal scrollbar on the document is the single most
 * reliable signal that something is overflowing the viewport.
 */
async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  // +1 absorbs sub-pixel rounding in the layout engine.
  expect(
    scrollWidth,
    `document scrollWidth ${String(scrollWidth)}px exceeds viewport ${String(innerWidth)}px`,
  ).toBeLessThanOrEqual(innerWidth + 1);
}

test.describe("Mobile layout", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("app shell renders without horizontal overflow", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("primary navigation is reachable through the sidebar sheet", async ({
    page,
  }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

    // The desktop rail is hidden below md; nav lives behind the header trigger.
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();

    const nav = page.getByRole("dialog");
    await expect(nav.getByRole("link", { name: "Series" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Authors" })).toBeVisible();
  });

  test("library list renders without horizontal overflow", async ({ page }) => {
    await seedWork({ title: "The Great Gatsby" });

    await page.goto("/library");
    await expect(page.getByText("The Great Gatsby")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("serves the grid on phones even when table view is stored", async ({
    page,
  }) => {
    await seedWork({ title: "The Great Gatsby" });
    await page.addInitScript(() => {
      localStorage.setItem("library-view", "table");
    });

    await page.goto("/library");
    await expect(page.getByText("The Great Gatsby")).toBeVisible();

    // An 800px-wide table squeezed into 360px renders every cell as an
    // ellipsis, so phones get the grid regardless of the stored preference.
    await expect(page.locator("table")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("work detail stacks without horizontal overflow", async ({ page }) => {
    await seedWork({ title: "The Great Gatsby" });
    await page.goto("/library");
    await page.getByText("The Great Gatsby").click();

    await expect(
      page.getByRole("heading", { name: "The Great Gatsby" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test.describe("admin surfaces fit the viewport", () => {
    for (const path of ["/settings", "/upload", "/duplicates", "/health"]) {
      test(`${path} renders without horizontal overflow`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoHorizontalOverflow(page);
      });
    }
  });

  test("shelf bulk actions stay inside the viewport", async ({ page }) => {
    await seedWork({ title: "The Great Gatsby" });
    await page.goto("/shelves");

    // Selection is a >=md affordance on the library, but shelf pages keep
    // their own selection bar — it must not overhang the viewport edges.
    const bar = page.getByTestId("selection-bar");
    if (await bar.isVisible().catch(() => false)) {
      const viewport = page.viewportSize();
      const box = await bar.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        (viewport?.width ?? 0) + 1,
      );
    }
    await expectNoHorizontalOverflow(page);
  });

  test("facet filters are reachable through the filters sheet", async ({
    page,
  }) => {
    await seedWork({ title: "The Great Gatsby" });
    await page.goto("/library");
    await expect(page.getByText("The Great Gatsby")).toBeVisible();

    // The 224px desktop rail is hidden below md; this button replaces it.
    await page.getByRole("button", { name: /Filters/ }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Format")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

export { expectNoHorizontalOverflow };
