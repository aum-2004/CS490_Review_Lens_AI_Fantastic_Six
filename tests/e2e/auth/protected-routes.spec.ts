import { expect, test } from "@playwright/test";

test("rejects direct API access without identity, including a forged owner argument", async ({
  request,
}) => {
  const response = await request.get("/api/auth/session?ownerId=forged-user", {
    headers: { "x-user-id": "forged-user" },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
  });
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("redirects protected navigation, returns after login, and rejects it again after logout", async ({
  page,
  context,
}) => {
  // No target feature is supplied by S1-010. For signed-in users this route
  // reaches Next's existing 404 until the owning story adds the target page.
  const destination = "/analysis-targets/new?source=direct";
  await page.goto(destination);
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(destination);
  expect((await context.request.get("/api/auth/session")).status()).toBe(200);

  await page.goto("/login");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  const response = await context.request.get(destination, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(new URL(response.headers().location, response.url()).pathname).toBe("/login");
  const post = await context.request.post("/analysis-targets/new", {
    maxRedirects: 0,
    data: "dummy",
  });
  expect(post.status()).toBe(303);
});

test("ignores an external login destination", async ({ page }) => {
  await page.goto("/login?next=https%3A%2F%2Fexample.com");
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("fixture@example.com");
  await expect(page).toHaveURL(/\/login\?/);
});
