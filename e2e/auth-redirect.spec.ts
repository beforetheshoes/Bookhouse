import { test, expect } from "@playwright/test";

test("unauthenticated visit to /library redirects to /auth/login", async ({
  request,
}) => {
  // TanStack Router redirects /library → /library?page=1&pageSize=50&sort=title-asc
  // to fill in default search params before the auth guard runs. Requesting the
  // URL with those defaults already filled in goes straight to the auth check.
  const response = await request.get("/library?page=1&pageSize=50&sort=title-asc", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/\/auth\/login/);
});
