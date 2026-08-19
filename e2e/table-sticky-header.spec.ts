import { test, expect } from "@playwright/test";
import { seedWork, cleanTestData } from "./helpers/seed";

test.describe("Virtualized table", () => {
  test.afterEach(async () => {
    await cleanTestData();
  });

  test("keeps its header pinned while the rows scroll", async ({ page }) => {
    for (let i = 0; i < 40; i++) {
      await seedWork({ title: `Sticky Book ${String(i).padStart(3, "0")}` });
    }

    await page.addInitScript(() => {
      localStorage.setItem("library-view", "table");
    });
    await page.goto("/library");
    await expect(page.locator("table")).toBeVisible();

    const result = await page.evaluate(() => {
      const table = document.querySelector("table");
      if (!table) throw new Error("no table rendered");
      const container = table.parentElement as HTMLElement;
      const scroller = container.parentElement as HTMLElement;
      const thead = table.querySelector("thead") as HTMLElement;

      const scrollerTop = scroller.getBoundingClientRect().top;
      scroller.scrollTop = 600;
      void scroller.offsetHeight;

      return {
        scrolled: scroller.scrollTop,
        // The wrapper must not become the scrollport, or the header — whose
        // nearest scrolling ancestor it would be — scrolls away with the rows.
        containerScrollsY:
          getComputedStyle(container).overflowY !== "visible",
        headerOffsetFromScroller: Math.round(
          thead.getBoundingClientRect().top - scrollerTop,
        ),
        scrollerScrollsX: getComputedStyle(scroller).overflowX !== "visible",
      };
    });

    expect(result.scrolled).toBeGreaterThan(0);
    expect(result.containerScrollsY).toBe(false);
    // Pinned to the top of its scroller rather than carried off with the rows.
    expect(Math.abs(result.headerOffsetFromScroller)).toBeLessThanOrEqual(4);
    // The wide table must still be able to scroll sideways somewhere.
    expect(result.scrollerScrollsX).toBe(true);
  });
});
