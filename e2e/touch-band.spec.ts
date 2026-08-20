import { test, expect } from "@playwright/test";
import { seedHostileWork, seedShelf, seedWork, cleanTestData } from "./helpers/seed";

/**
 * The 768-1023 band. Everything else in the suite runs at 360x740, so claims
 * about this band went unverified for ten review rounds - and three controls
 * sat at 16px here the whole time.
 */
const WIDTHS = [768, 1023];

test.describe("Touch band", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  for (const width of WIDTHS) {
    for (const view of ["grid", "table"] as const) {
    test(`${String(width)}px in ${view} view: no overflow and no control under 36px`, async ({
      page,
    }) => {
      const { work } = await seedHostileWork();
      await seedShelf({
        name: "Touch Band Shelf",
        editionIds: work.editions.map((e) => e.id),
      });
      await page.setViewportSize({ width, height: 1024 });

      // Table view is reachable from md up - this band - and its select column
      // held 13px checkboxes that no sweep ever entered table view to find.
      // Both views have to be swept: pinning the preference to "table" took
      // the grid's card links and tile-size buttons back out of coverage.
      await page.addInitScript((stored: string) => {
        localStorage.setItem("library-view", stored);
      }, view);

      for (const path of ["/library", "/settings", "/authors", "/upload", "/shelves"]) {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(700);

        const r = await page.evaluate(() => {
          const small: { h: number; w: number; label: string }[] = [];
          let seen = 0;
          document
            .querySelectorAll<HTMLElement>(
              'button, a[href], input[type="checkbox"], input[type="radio"], [role="tab"], [data-slot="select-trigger"]',
            )
            .forEach((el) => {
              const target = el.closest("label") ?? el;
              const b = target.getBoundingClientRect();
              const cs = getComputedStyle(el);
              if (b.width === 0 || b.height === 0) return;
              if (cs.visibility === "hidden" || cs.opacity === "0") return;
              if (el.closest("[aria-hidden='true']")) return;
              seen += 1;
              // Width too: the split delete trigger was 36 tall and 34 wide,
              // and survived three fixes because only height was measured.
              if (b.height < 36 || b.width < 36) {
                small.push({
                  h: Math.round(b.height),
                  w: Math.round(b.width),
                  label: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 30),
                });
              }
            });
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            small,
            seen,
          };
        });

        expect(r.seen, `${path} rendered no controls`).toBeGreaterThan(3);
        expect(r.overflow, `${path} overflows by ${String(r.overflow)}px`).toBeLessThanOrEqual(1);
        expect(r.small, `${path} controls under 36px: ${JSON.stringify(r.small)}`).toEqual([]);
      }
    });
    }

    test(`${String(width)}px: filters use the sheet, not the rail`, async ({ page }) => {
      await seedHostileWork();
      await page.setViewportSize({ width, height: 1024 });
      await page.goto("/library");
      await page.waitForTimeout(800);

      // The rail leaves a toolbar column too narrow to hold the sort select,
      // so the whole touch band gets the sheet instead.
      await expect(page.getByRole("button", { name: /Filters/ })).toBeVisible();
      await expect(page.locator('[data-testid="library-filters-rail"]')).toBeHidden();
    });
  }
});

/**
 * The bulk action bar between a phone and a desktop.
 *
 * The bar sizes to seven whitespace-nowrap buttons - about 884px - and used to
 * centre itself on the viewport from 768px up. Between 768 and roughly 900 it
 * was therefore wider than the screen and hung off both edges, which is the
 * exact failure it was built to fix, just moved up a breakpoint. Nothing in
 * the overflow suite can see it: a `fixed` element does not lengthen
 * document.scrollWidth.
 */
test.describe("Bulk action bar geometry", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  for (const width of [768, 820, 900, 1023, 1280]) {
    test(`${String(width)}px: every bulk action is on screen and clickable`, async ({
      page,
    }) => {
      await seedWork({ title: "Bar Geometry One" });
      await seedWork({ title: "Bar Geometry Two" });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => {
        localStorage.setItem("library-view", "table");
      });
      await page.goto("/library");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(800);

      await page.getByLabel("Select all").first().click();
      const bar = page.locator('[data-testid="library-selection-toolbar"]');
      await expect(bar).toBeVisible();

      const geometry = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-testid="library-selection-toolbar"]',
        );
        if (!el) return null;
        const vw = document.documentElement.clientWidth;
        const rect = el.getBoundingClientRect();
        // Reachability, not just geometry: a control whose centre resolves to
        // some other element is covered, and one outside the viewport resolves
        // to nothing at all.
        const unreachable: { label: string; x: number; y: number }[] = [];
        el.querySelectorAll<HTMLElement>("button").forEach((btn) => {
          const b = btn.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return;
          const x = Math.round(b.left + b.width / 2);
          const y = Math.round(b.top + b.height / 2);
          const hit = document.elementFromPoint(x, y);
          if (hit === null || !el.contains(hit)) {
            unreachable.push({
              label: (btn.textContent ?? btn.tagName).trim().slice(0, 30),
              x,
              y,
            });
          }
        });
        // The docked sidebar's account menu sits at the bottom-left, under a
        // full-bleed bar. While a selection was active it could not be opened.
        const account = document.querySelector<HTMLElement>(
          '[data-slot="sidebar-footer"] [data-slot="dropdown-menu-trigger"]',
        );
        let accountCovered: boolean | null = null;
        if (account) {
          const a = account.getBoundingClientRect();
          const hit = document.elementFromPoint(
            Math.round(a.left + a.width / 2),
            Math.round(a.top + a.height / 2),
          );
          accountCovered = hit !== null && el.contains(hit);
        }
        return {
          vw,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          unreachable,
          accountCovered,
        };
      });

      expect(geometry, "selection toolbar not found").not.toBeNull();
      const g = geometry as NonNullable<typeof geometry>;
      expect(g.left, `bar starts at ${String(g.left)}px, off the left edge`).toBeGreaterThanOrEqual(0);
      expect(
        g.right,
        `bar ends at ${String(g.right)}px, past the ${String(g.vw)}px viewport`,
      ).toBeLessThanOrEqual(g.vw);
      expect(
        g.unreachable,
        `bar buttons that cannot be clicked: ${JSON.stringify(g.unreachable)}`,
      ).toEqual([]);
      expect(
        g.accountCovered,
        "the bulk bar covers the sidebar account menu while a selection is active",
      ).toBe(false);
    });
  }
});

/**
 * Checkboxes wrapped in a padded <label> to reach a 36px hit area.
 *
 * Wrapping is only safe while there is exactly one label per input: a nested
 * label is invalid HTML and two associated labels make the accessible name
 * ambiguous, while a second click handler on the same activation would toggle
 * the box straight back off. happy-dom implements neither label activation nor
 * layout, so none of this is expressible in a unit test - the tap has to land
 * on the padding, in a browser, at a width where the table view exists.
 */
test.describe("Padded checkbox labels", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("tapping the padding of a row label selects exactly one work", async ({
    page,
  }) => {
    await seedWork({ title: "Padded Label One" });
    await seedWork({ title: "Padded Label Two" });
    await page.setViewportSize({ width: 768, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("library-view", "table");
    });
    await page.goto("/library");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    const rowBox = page.getByLabel("Select row").first();
    const padding = await rowBox.evaluate((el) => {
      const label = el.closest("label");
      if (!label) return null;
      const l = label.getBoundingClientRect();
      const i = el.getBoundingClientRect();
      return {
        labels: (el as HTMLInputElement).labels?.length ?? 0,
        // 2px inside the label's top-left, provably outside the input.
        x: Math.round(l.left + 2),
        y: Math.round(l.top + 2),
        insideInput:
          l.left + 2 >= i.left && l.left + 2 <= i.right &&
          l.top + 2 >= i.top && l.top + 2 <= i.bottom,
      };
    });
    expect(padding, "row checkbox is not wrapped in a label").not.toBeNull();
    const pad = padding as NonNullable<typeof padding>;
    expect(pad.labels, "input has more than one associated label").toBe(1);
    expect(pad.insideInput, "no padding outside the input to tap").toBe(false);

    await page.mouse.click(pad.x, pad.y);
    await page.waitForTimeout(300);
    await expect(page.getByText("1 work selected")).toBeVisible();
  });

  test("add-editions rows have one label each and toggle once", async ({
    page,
  }) => {
    const work = await seedWork({ title: "Add Editions Source" });
    await seedShelf({ name: "Padded Label Shelf", editionIds: [] });
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/shelves");
    await page.waitForLoadState("domcontentloaded");
    await page.getByText("Padded Label Shelf").first().click();
    await page.waitForTimeout(600);
    await page.locator('[data-testid="add-editions-btn"]').click();
    await page.waitForTimeout(700);

    const editionId = work.editions[0]?.id ?? "";
    const check = page.locator(`[data-testid="edition-check-${editionId}"]`);
    await expect(check).toBeVisible();
    expect(
      await check.evaluate((el) => (el as HTMLInputElement).labels?.length ?? 0),
      "edition checkbox has more than one associated label",
    ).toBe(1);

    await page.locator(`[data-testid="edition-row-${editionId}"]`).click();
    await page.waitForTimeout(200);
    expect(
      await check.evaluate((el) => (el as HTMLInputElement).checked),
      "clicking the row label did not leave the box checked",
    ).toBe(true);
  });
});
