import { expect, test, type Page } from "@playwright/test";

const targetPath = "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

async function login(page: Page, email = "fixture@example.com") {
  await page.goto(`/login?next=${encodeURIComponent(targetPath)}`);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(targetPath);
}

test("opens from My Targets, survives refresh, switches context and explains disabled ingestion safely", async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  await expect(
    page.getByRole("link", { name: "https://www.google.com/maps/place/A+Bakery" }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Saved review for A bakery",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  await expect(page.getByRole("button", { name: "Ingestion complete" })).toBeDisabled();
  await expect(
    page.getByText("Review collection is currently unavailable. Please try again later."),
  ).toBeVisible();
  await expect(page.getByText("Last completed run: 1 reviews saved.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Saved review for A bakery",
  );
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Targets" })
    .click();
  await page.getByRole("link", { name: "Open A coffee shop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Saved review for A coffee shop",
  );
  // Next.js retains same-user history in hidden Activity trees; assert the active workspace.
  await expect(page.getByRole("main")).not.toContainText("Saved review for A bakery");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Start ingestion" })).toBeVisible();
  await page.screenshot({ path: "test-results/s1-018-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/s1-018-desktop.png", fullPage: true });
});

test("renders authoritative card badges and never turns a status outage into Not ingested", async ({
  page,
  request,
}) => {
  await login(page);
  await page.goto("/analysis-targets");
  const cards = page.getByRole("list", { name: "Your analysis targets" });
  await expect(cards.getByText("Ingested", { exact: true })).toHaveCount(1);
  await expect(cards.getByText("Failed", { exact: true })).toHaveCount(1);
  await expect(cards.getByText("Not ingested", { exact: true })).toHaveCount(1);
  await request.get("http://127.0.0.1:54329/fail-status-reads");
  try {
    await page.reload();
    await expect(cards.getByText("Status unavailable", { exact: true })).toHaveCount(3);
    await expect(cards.getByText("Not ingested", { exact: true })).toHaveCount(0);
  } finally {
    await request.get("http://127.0.0.1:54329/restore-status-reads");
  }
});

test("User B receives only their own processing badge", async ({ page }) => {
  await login(page, "fixture-b@example.com");
  await page.goto("/analysis-targets");
  await expect(page.getByText("Ingesting", { exact: true })).toBeVisible();
  await expect(page.getByText("Ingested", { exact: true })).toHaveCount(0);
});
test("shows provider-resolved URL identity without claiming an independent match", async ({
  page,
  request,
}) => {
  await request.get("http://127.0.0.1:54329/fixture/url-completion-on");
  try {
    await login(page);
    await page.goto("/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
    await expect(
      page.getByText(/The review service identified this business as Provider coffee shop/),
    ).toContainText("has not been independently matched to the saved link");
    await expect(page.getByText("Ingested", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Ingestion complete" })).toBeDisabled();
    await expect(page.getByText(/Further collection is unavailable/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
      "Saved review for A coffee shop",
    );
    await page.screenshot({ path: "test-results/s1-019-url-provenance.png", fullPage: true });
  } finally {
    await request.get("http://127.0.0.1:54329/fixture/url-completion-off");
  }
});

test("restores partial results after reload and distinguishes failed ingestion with saved reviews", async ({
  page,
  request,
}) => {
  await request.get("http://127.0.0.1:54329/fixture/url-completion-on?partial=true");
  try {
    await login(page);
    await page.goto("/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
    await expect(page.getByText("Partially ingested", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/Last completed run/)).toContainText(
      "1 reviews saved. 2 unusable records were skipped.",
    );
    await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
      "Saved review for A coffee shop",
    );
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `test-results/s2-005-partial-${width}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: "test-results/s2-005-partial-375-dark.png", fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/analysis-targets");
    await expect(page.getByText("Partially ingested", { exact: true })).toHaveCount(1);
    await page.getByRole("link", { name: "Open A bookstore" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bookstore");
    await expect(page.getByRole("main").getByText("Failed", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("usage limit");
    await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
      "Saved review for A bookstore",
    );
    await expect(
      page.getByRole("main").getByText("Partially ingested", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: "test-results/s2-005-failed-375.png", fullPage: true });
  } finally {
    await request.get("http://127.0.0.1:54329/fixture/url-completion-off");
  }
});

test("denies direct cross-user, missing and malformed targets without exposing data", async ({
  page,
}) => {
  await login(page, "fixture-b@example.com");
  for (const path of [
    targetPath,
    "/analysis-targets/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "/analysis-targets/not-an-id",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "This target isn't available to your account. Go back to My Targets.",
    );
    await expect(page.getByRole("button", { name: "Start ingestion" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("A bakery");
    await expect(page.locator("body")).not.toContainText("Saved review");
  }
});

test("redirects anonymous direct navigation back through sign in", async ({ page }) => {
  await page.goto(targetPath);
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(targetPath)}`);
  await expect(page.getByRole("button", { name: "Start ingestion" })).toHaveCount(0);
});

test("removes the workspace after logout and denies it to the next signed-in user", async ({
  page,
  context,
}) => {
  await login(page);
  await page.getByRole("button", { name: "fixture@example.com", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "A bakery" })).toHaveCount(0);
  expect((await context.request.get(targetPath, { maxRedirects: 0 })).status()).toBe(303);
  await login(page, "fixture-b@example.com");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This target isn't available to your account.",
  );
  await expect(page.getByRole("list", { name: "Saved reviews" })).toHaveCount(0);
});
