import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login?next=%2Fanalysis-targets");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL("/analysis-targets");
  await expect(page.getByRole("heading", { name: "My Targets", exact: true })).toBeVisible();
}

test("lists every owned target through the real SDK and preserves the list after navigation and refresh", async ({
  page,
  context,
}) => {
  await login(page, "fixture@example.com");
  const targets = page.getByRole("list", { name: "Your analysis targets" });
  // The fixture caps database responses at TWO rows, below this user's three targets.
  await expect(targets.getByRole("heading", { level: 2 })).toHaveText([
    "A bakery",
    "A bookstore",
    "A coffee shop",
  ]);
  await expect(targets.getByText("Google Maps", { exact: true })).toHaveCount(3);
  await expect(targets.getByRole("link", { name: "Open A bakery" })).toHaveAttribute(
    "href",
    "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  );
  await expect(
    targets.getByRole("link", { name: "https://www.google.com/maps/place/A+Bakery" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("B restaurant", { exact: true })).toHaveCount(0);
  const response = await context.request.get(
    "/api/analysis-targets?ownerId=00000000-0000-4000-8000-000000000010",
    { headers: { "x-user-id": "00000000-0000-4000-8000-000000000010" } },
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("private");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body.data.map((target: { name: string }) => target.name)).toEqual([
    "A bakery",
    "A bookstore",
    "A coffee shop",
  ]);
  expect(Object.keys(body.data[0]).sort()).toEqual([
    "createdAt",
    "id",
    "name",
    "platform",
    "sourceUrl",
  ]);
  await page.reload();
  await expect(targets.getByRole("heading", { level: 2 })).toHaveCount(3);
  await page.goto("/");
  await expect(page).toHaveURL("/analysis-targets");
  await expect(targets.getByRole("heading", { level: 2 })).toHaveCount(3);
});

test("isolates User B from User A even with forged owner arguments", async ({ page, context }) => {
  await login(page, "fixture-b@example.com");
  await expect(page.getByRole("heading", { name: "B restaurant" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^A / })).toHaveCount(0);
  const response = await context.request.get(
    "/api/analysis-targets?ownerId=00000000-0000-4000-8000-000000000009&userId=00000000-0000-4000-8000-000000000009",
    { headers: { "x-user-id": "00000000-0000-4000-8000-000000000009" } },
  );
  expect(response.status()).toBe(200);
  expect((await response.json()).data.map((target: { name: string }) => target.name)).toEqual([
    "B restaurant",
  ]);
});

test("shows a real empty state with the creation handoff link", async ({ page, context }) => {
  await login(page, "empty-fixture@example.com");
  await expect(page.getByRole("heading", { name: "No targets yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your first target" })).toHaveAttribute(
    "href",
    "/analysis-targets/new",
  );
  expect((await (await context.request.get("/api/analysis-targets")).json()).data).toEqual([]);
});

test("shows a retryable safe failure rather than an empty or partial list", async ({
  page,
  context,
}) => {
  await login(page, "unavailable-fixture@example.com");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "We couldn't load your targets",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("No targets yet")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("private fixture database failure");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "We couldn't load your targets",
  );
  const response = await context.request.get("/api/analysis-targets");
  expect(response.status()).toBe(500);
  expect(response.headers()["cache-control"]).toContain("private");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({
    success: false,
    error: {
      code: "ANALYSIS_TARGET_LIST_FAILED",
      message: "We couldn't load your targets. Please try again.",
    },
  });
});

test("keeps mobile navigation usable, supports keyboard menu dismissal and denies access after logout", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, "fixture@example.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "New Target", exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: "fixture@example.com", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  const response = await context.request.get("/api/analysis-targets?ownerId=forged");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "AUTH_REQUIRED", message: "Please sign in to continue." },
  });
  await page.goBack();
  await expect(page.getByRole("heading", { name: "A bakery" })).toHaveCount(0);
  const navigation = await context.request.get("/analysis-targets", { maxRedirects: 0 });
  expect(navigation.status()).toBe(303);
});

test("fails closed after provider logout failure clears SDK cookies, and can sign in again", async ({
  page,
  context,
  request,
}) => {
  await login(page, "fixture@example.com");
  await request.get("http://127.0.0.1:54329/fail-next-logout");
  await page.getByRole("button", { name: "fixture@example.com", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  // The SDK clears local cookies even on a remote 500; the page guard can
  // immediately redirect during the Server Action's render. Check both outcomes
  // via a fresh protected request rather than assuming the menu stays mounted.
  await expect
    .poll(async () => (await context.request.get("/api/analysis-targets")).status())
    .toBe(401);
  await page.goto("/analysis-targets");
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("private fixture logout failure");
  await login(page, "fixture@example.com");
  await page.getByRole("button", { name: "fixture@example.com", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
});
test("denies anonymous API requests independently of navigation protection", async ({
  request,
}) => {
  const response = await request.get(
    "/api/analysis-targets?ownerId=00000000-0000-4000-8000-000000000009",
    { headers: { "x-user-id": "00000000-0000-4000-8000-000000000009" } },
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).not.toHaveProperty("data");
});
