import { test, expect, type Page } from "@playwright/test";
import { seedHostileWork, seedShelf, seedWork, cleanTestData } from "./helpers/seed";

/**
 * Asserts the document does not scroll horizontally.
 *
 * This is the assertion happy-dom fundamentally cannot make: it performs no
 * layout, so unit tests can only prove a responsive class is *present*, never
 * that it *works*. A horizontal scrollbar on the document is the single most
 * reliable signal that something is overflowing the viewport.
 */
async function expectNoHorizontalOverflow(page: Page) {
  // Compare against clientWidth, the layout viewport. window.innerWidth is
  // unreliable here: under Playwright's mobile device emulation it tracks the
  // visual viewport, so an overflowing page could report innerWidth == the
  // overflowed width and the check would pass while the page scrolled.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // +1 absorbs sub-pixel rounding in the layout engine.
  expect(
    scrollWidth,
    `document scrollWidth ${String(scrollWidth)}px exceeds layout viewport ${String(clientWidth)}px`,
  ).toBeLessThanOrEqual(clientWidth + 1);
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
        // Short, tidy data hides real overflow: /authors and the work
        // detail shelf badges both overflowed with realistic lengths while
        // this suite was green.
        const { work: w } = await seedHostileWork();
        await seedShelf({
          name: "Currently Reading And Also Some Other Long Shelf Name",
          editionIds: w.editions.map((e) => e.id),
        });

        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(800);
        await expectNoHorizontalOverflow(page);
      });
    }
  });

  test("detail routes fit the viewport", async ({ page }) => {
    // Author and series DETAIL pages carry the longest user strings and had no
    // coverage: the suite's "/authors/" and "/series/" entries were index
    // routes wearing detail-route clothing.
    const { work, series } = await seedHostileWork();

    await page.goto(`/library/${work.id}`);
    await page.waitForTimeout(900);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/series/${series.id}`);
    await page.waitForTimeout(900);
    await expectNoHorizontalOverflow(page);

    const authorLink = page.locator('a[href^="/authors/"]').first();
    if (await authorLink.count()) {
      await authorLink.click();
      await page.waitForTimeout(900);
      await expectNoHorizontalOverflow(page);
    }
  });

  const TAP_ROUTES = [
  "/library",
  "/settings",
  "/shelves",
  "/upload",
  "/authors",
  "/series",
  "/settings/missing-files",
  "/duplicates",
  // /health is intentionally absent: it is a read-only dashboard with no
  // controls beyond the app shell, so a tap-target sweep there measures
  // nothing. Its layout is covered by the overflow suite.
  "/match-suggestions",
  "/settings/users",
];

  for (const route of TAP_ROUTES) {
  test(`interactive controls on ${route} meet a real tap-target floor`, async ({ page }) => {
    const tapWork = await seedWork({ title: "Tap Target Book" });
    // /shelves and /series render nothing without a shelf, so the name links
    // on them were never measured.
    await seedShelf({
      name: "Tap Target Shelf",
      editionIds: tapWork.editions.map((e) => e.id),
    });
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);


    // Measured from computed layout, not class strings. Asserting on
    // classNames cannot catch a utility that loses on CSS specificity or gets
    // stripped by tailwind-merge - both of which happened on this branch.
    const measure = () => page.evaluate(() => {
      const bad: { label: string; h: number; cls: string }[] = [];
      let seen = 0;
      document
        .querySelectorAll<HTMLElement>(
          'button, a[href], select, input[type="checkbox"], input[type="radio"], [role="tab"], [cmdk-item], [data-slot="select-trigger"]',
        )
        .forEach((el) => {
          // A native input wrapped in a <label> inherits the label's hit area -
          // clicking anywhere in it activates the control - so measure the
          // label. Measuring the 13px input would be the wrong model.
          const target = el.closest("label") ?? el;
          const r = target.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.opacity === "0") return;
          // Radix renders a 1px aria-hidden native <select> alongside its own
          // trigger for form compatibility - not a tap target. Do NOT also
          // filter on pointer-events: an open Radix menu sets it to none on
          // the whole body, which would silently empty this sweep.
          if (el.closest("[aria-hidden='true']")) return;
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

    // Measure at rest first. Opening a Radix menu marks the rest of the page
    // aria-hidden, which the filter below excludes - so measuring only with a
    // menu open silently inspects nothing.
    const { tooSmall, inspected } = await measure();

    // Then the transient surface, on its own terms.
    const menuTrigger = page.locator('[data-slot="dropdown-menu-trigger"]').first();
    if (await menuTrigger.count()) {
      await menuTrigger.click();
      await page.waitForTimeout(400);
      // Without this, a menu that failed to open yields an empty row list and
      // the check below passes having measured nothing.
      const opened = await page.locator('[role="menu"]').count();
      expect(opened, `${route}: menu trigger did not open a menu`).toBeGreaterThan(0);
      const menuRows = await page.evaluate(() => {
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'),
        );
        return rows
          .map((el) => ({ h: Math.round(el.getBoundingClientRect().height), label: (el.textContent ?? "").trim().slice(0, 30) }))
          .filter((r) => r.h > 0 && r.h < 36);
      });
      expect(menuRows, `${route} menu rows under 36px: ${JSON.stringify(menuRows)}`).toEqual([]);
      await page.keyboard.press("Escape");
    }

    // Guard against the check silently passing on a page that rendered nothing.
    // The app shell alone renders exactly three buttons (sidebar trigger,
    // search, theme), so a floor of 3 would pass on a route whose body
    // rendered nothing. Require controls beyond the shell.
    expect(
      inspected,
      `${route} rendered no controls beyond the app shell`,
    ).toBeGreaterThan(3);
    expect(
      tooSmall,
      `${route} controls under 36px: ${JSON.stringify(tooSmall, null, 2)}`,
    ).toEqual([]);
  });
  }

  test("?view=editions still renders a full library on a phone", async ({
    page,
  }) => {
    for (let i = 0; i < 3; i++) await seedWork({ title: `Editions Book ${String(i)}` });

    await page.goto("/library?view=editions");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // The loader used to truncate the works fetch to pageSize 1 for this view.
    // A phone is forced onto the grid, so that one-item response rendered as
    // the entire library beneath a full-library total count.
    expect(await page.locator('a[href^="/library/"]').count()).toBeGreaterThan(1);
    await expectNoHorizontalOverflow(page);
  });

  test("landscape phone has no horizontal overflow", async ({ page }) => {
    await seedWork({ title: "Landscape Book" });
    await page.setViewportSize({ width: 740, height: 360 });

    for (const path of ["/library", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(700);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("tablet width has no horizontal overflow", async ({ page }) => {
    await seedWork({ title: "Tablet Book" });
    // 768-1024 is the band where md: has kicked in but space is still tight,
    // and no other test covers it.
    await page.setViewportSize({ width: 820, height: 1024 });

    for (const path of ["/library", "/settings", "/match-suggestions"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(700);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("filters sheet close is a real target inside the panel", async ({
    page,
  }) => {
    await seedWork({ title: "Sheet Scroll Book" });
    await page.goto("/library");
    await page.getByRole("button", { name: /Filters/ }).click();
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
      const close = Array.from(c.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Close"),
      ) as HTMLElement;
      const cb = close.getBoundingClientRect();
      const sb = c.getBoundingClientRect();
      return {
        h: Math.round(cb.height),
        w: Math.round(cb.width),
        insideRight: cb.right <= sb.right + 1,
        insideTop: cb.top >= sb.top - 1,
      };
    });

    // The Close is a sibling of the scrolling body, not inside it, so an
    // earlier version of this test - which scrolled and asserted it had not
    // moved - could never fail.
    expect(r.h).toBeGreaterThanOrEqual(36);
    expect(r.w).toBeGreaterThanOrEqual(36);
    expect(r.insideRight).toBe(true);
    expect(r.insideTop).toBe(true);
  });

  test("landscape grid keeps a usable height", async ({ page }) => {
    for (let i = 0; i < 6; i++) await seedWork({ title: `Landscape Grid ${String(i)}` });
    await page.setViewportSize({ width: 740, height: 360 });
    await page.goto("/library");
    await page.waitForTimeout(900);

    const h = await page.evaluate(() => {
      const el = document.querySelector('[class*="overflow-auto"][class*="pr-2"]');
      return el ? Math.round(el.getBoundingClientRect().height) : -1;
    });
    // The md: cap does not apply at 740px wide, so without a floor the
    // viewport-derived height collapses to about one clipped row.
    expect(h).toBeGreaterThan(240);
  });

  test("grid scroller ends within the viewport, not below the fold", async ({
    page,
  }) => {
    for (let i = 0; i < 12; i++) await seedWork({ title: `Fold Book ${String(i)}` });
    await page.goto("/library");
    await page.waitForTimeout(1000);

    const r = await page.evaluate(() => {
      const el = document.querySelector('[class*="overflow-auto"][class*="pr-2"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: window.innerHeight };
    });

    expect(r).not.toBeNull();
    const top = r?.top ?? 0;
    const vh = r?.vh ?? 0;
    // The height is measured from where the grid actually sits, so its bottom
    // should land inside the viewport - but only when there is room for a
    // usable grid below the chrome. A scroller shorter than one row of covers
    // is worse than letting the page scroll, so below that floor the grid
    // deliberately extends past the fold.
    const roomBelowChrome = vh - top;
    if (roomBelowChrome >= 320) {
      expect(r?.bottom ?? 0).toBeLessThanOrEqual(vh + 1);
      // ...and the page controls must be reachable. Assert on the next-page
      // ARROW's bottom edge: an earlier version of this looked for a testid
      // that only existed in a vitest mock and fell back to the outermost
      // matching div at top 0, so it could never fail.
      const pager = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="library-pagination"]');
        if (!row) return null;
        const grid = document.querySelector('[class*="overflow-auto"][class*="pr-2"]');
        if (!grid) return null;
        // Scroll the grid to its end so its last row is at the bottom edge.
        (grid as HTMLElement).scrollTop = (grid as HTMLElement).scrollHeight;
        const pb = row.getBoundingClientRect();
        const gb = grid.getBoundingClientRect();
        return {
          pagerTop: Math.round(pb.top),
          gridBottom: Math.round(gb.bottom),
          barHeight: Math.round(pb.height),
        };
      });
      expect(pager, "pagination row not found - is the testid still there?").not.toBeNull();
      // `sticky bottom-0` makes "the arrow is inside the viewport" true by
      // construction, so asserting that proves nothing. The bar is opaque, so
      // what matters is that it does not paint over the grid's last row.
      expect(
        pager?.pagerTop ?? 0,
        `sticky pagination (${String(pager?.barHeight)}px) covers the grid's last row`,
      ).toBeGreaterThanOrEqual((pager?.gridBottom ?? 0) - 1);
    } else {
      expect(r?.bottom ?? 0).toBeGreaterThanOrEqual(top + 320);
    }
  });

  test("work detail fits the viewport with long titles and shelf names", async ({
    page,
  }) => {
    const { work } = await seedHostileWork();
    await seedShelf({
      name: "Currently Reading And Also Some Other Long Shelf Name",
      editionIds: work.editions.map((e) => e.id),
    });

    await page.goto("/library");
    await page.getByText("A Genuinely Very Long").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(900);

    // A shelf badge is whitespace-nowrap and shrink-0; a long shelf name set
    // the page width before it was allowed to wrap.
    await expectNoHorizontalOverflow(page);
  });

  test("shelf detail page fits the viewport", async ({ page }) => {
    const work = await seedWork({
      title: "Shelf Bar Book",
    });
    // Seed the shelf properly. The previous version navigated to the shelves
    // INDEX (which has no selection bar) and guarded on is-visible, so it
    // could only ever pass.
    const shelf = await seedShelf({
      // Unbreakable token: the breadcrumb and h1 both set the page width here.
      name: "Mobile Shelf Recommendations_From_Everyone_I_Know_2026",
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
