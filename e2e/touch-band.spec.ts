import { test, expect } from "@playwright/test";
import { seedHostileWork, seedShelf, cleanTestData } from "./helpers/seed";

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
    test(`${String(width)}px: no overflow and no control under 36px`, async ({
      page,
    }) => {
      const { work } = await seedHostileWork();
      await seedShelf({
        name: "Touch Band Shelf",
        editionIds: work.editions.map((e) => e.id),
      });
      await page.setViewportSize({ width, height: 1024 });

      for (const path of ["/library", "/settings", "/authors", "/upload", "/shelves"]) {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(700);

        const r = await page.evaluate(() => {
          const small: { h: number; label: string }[] = [];
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
              if (b.height < 36) {
                small.push({
                  h: Math.round(b.height),
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
