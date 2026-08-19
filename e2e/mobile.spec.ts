import { test, expect, type Page } from "@playwright/test";
import { seedShelf, seedWork, cleanTestData } from "./helpers/seed";

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
    for (const path of [
      "/settings",
      "/upload",
      "/duplicates",
      "/health",
      "/match-suggestions",
      "/shelves",
      "/authors",
      "/series",
      "/settings/missing-files",
      "/settings/users",
    ]) {
      test(`${path} renders without horizontal overflow`, async ({ page }) => {
        // Seed first. An empty page has no cards, no tables and no long file
        // paths, so checking the empty state proves almost nothing — three
        // pages passed this check while overflowing by 10-53px with data.
        await seedWork({ title: "Overflow Probe Book" });

        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(800);
        await expectNoHorizontalOverflow(page);
      });
    }
  });

  const TAP_ROUTES = ["/library", "/settings", "/shelves", "/upload", "/authors"];

  for (const route of TAP_ROUTES) {
  test(`interactive controls on ${route} meet a real tap-target floor`, async ({ page }) => {
    await seedWork({ title: "Tap Target Book" });
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    // Open the transient surfaces too. The earlier version measured only
    // /library at rest, so it never saw a tab, a menu row or a sheet - and
    // 32px settings tabs sailed past a check whose selector included [role=tab].
    const menu = page.locator('[data-slot="dropdown-menu-trigger"]').first();
    if (await menu.count()) {
      await menu.click({ trial: false }).catch(() => undefined);
      await page.waitForTimeout(300);
    }

    // Measured from computed layout, not class strings. Asserting on
    // classNames cannot catch a utility that loses on CSS specificity or gets
    // stripped by tailwind-merge - both of which happened on this branch.
    const { tooSmall, inspected } = await page.evaluate(() => {
      const bad: { label: string; h: number; cls: string }[] = [];
      let seen = 0;
      document
        .querySelectorAll<HTMLElement>('button, a[href], select, [role="tab"], [data-slot="select-trigger"]')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.opacity === "0") return;
          // Radix renders a 1px aria-hidden native <select> alongside its own
          // trigger for form compatibility. Nothing aria-hidden or
          // pointer-events:none is a tap target by definition.
          if (el.closest("[aria-hidden='true']")) return;
          if (cs.pointerEvents === "none") return;
          seen += 1;
          if (r.height < 36) {
            bad.push({
              label: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40),
              h: Math.round(r.height),
              cls: el.className.toString().slice(0, 80),
            });
          }
        });
      return { tooSmall: bad, inspected: seen };
    });

    // Guard against the check silently passing on a page that rendered nothing.
    // Sparse routes legitimately have only a handful of controls, so this is a
    // did-anything-render floor, not a coverage target.
    expect(inspected).toBeGreaterThan(2);
    expect(
      tooSmall,
      `${route} controls under 36px: ${JSON.stringify(tooSmall, null, 2)}`,
    ).toEqual([]);
  });
  }

  test("shelf detail page fits the viewport", async ({ page }) => {
    const work = await seedWork({ title: "Shelf Bar Book" });
    // Seed the shelf properly. The previous version navigated to the shelves
    // INDEX (which has no selection bar) and guarded on is-visible, so it
    // could only ever pass.
    const shelf = await seedShelf({
      name: "Mobile Shelf",
      editionIds: work.editions.map((e) => e.id),
    });

    await page.goto(`/shelves/${shelf.id}`);
    await expect(
      page.getByRole("heading", { name: "Mobile Shelf" }),
    ).toBeVisible();
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
