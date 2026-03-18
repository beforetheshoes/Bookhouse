import { expect, test } from "@playwright/test";

test("navigates from the library to the hybrid book detail page", async ({ page }) => {
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText("The Fifth Season")).toBeVisible();
  await expect(page.getByText("Favorites")).toBeVisible();

  await page.getByRole("link", { name: "Open work" }).click();

  await expect(page.getByRole("heading", { name: "The Fifth Season" })).toBeVisible();
  await expect(page.getByText("The Broken Earth")).toBeVisible();
  await expect(page.getByText("Narrated by Robin Miles")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reading state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operational files" }).first()).toBeVisible();
  await expect(page.getByText("ebooks/fifth-season.epub")).toBeVisible();
  await expect(page.getByRole("button", { name: "Force by edition" })).toBeVisible();
  await expect(page.getByText("External link external-link-e2e-1")).toBeVisible();
});
