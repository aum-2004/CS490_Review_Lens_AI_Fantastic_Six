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
}

test("saves a chosen name independently of its source, restores it after login, and opens the same dataset", async ({
  page,
  context,
}) => {
  await login(page, "creation-fixture@example.com");
  await page.getByRole("link", { name: "New Target", exact: true }).click();
  await page.getByLabel("Target name *").fill("   ");
  const source = "https://www.google.com/maps/place/First+Fixture+Target";
  await page.getByLabel("Google Maps URL *").fill(source);
  await page.getByRole("button", { name: "Create target" }).click();
  await expect(page.getByText("Enter a name for this target.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Target name *")).toBeFocused();
  await expect(page.getByLabel("Google Maps URL *")).toHaveValue(source);
  await page.getByLabel("Target name *").fill("   Melissa's weekend shortlist   ");
  await page.getByRole("button", { name: "Create target" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Melissa's weekend shortlist");
  const workspaceUrl = new URL(page.url()).pathname;
  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  const link = saved.getByRole("link", { name: "Melissa's weekend shortlist", exact: true });
  await expect(link).toHaveAttribute("href", workspaceUrl);
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(saved).not.toContainText(source);
  await expect(page.getByRole("link", { name: source, exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/s3-001-desktop.png", fullPage: true });
  // A new session must restore the database record, rather than a client-only draft.
  await context.clearCookies();
  await login(page, "creation-fixture@example.com");
  await link.click();
  await expect(page).toHaveURL(workspaceUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Melissa's weekend shortlist");
  await expect(page.getByText(/No saved reviews yet/)).toBeVisible();
  await page.reload();
  await expect(link).toBeVisible();
  await expect(page.getByRole("link", { name: source, exact: true })).toBeVisible();
});

test("keeps sidebar names owner-scoped and reopens persisted review data on mobile", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, "fixture@example.com");
  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  await expect(saved.getByRole("link")).toHaveText(["A bakery", "A bookstore", "A coffee shop"]);
  await saved.getByRole("link", { name: "A coffee shop", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await expect(
    page
      .getByRole("list", { name: "Saved reviews" })
      .getByText("Saved review for A coffee shop", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/s3-001-mobile.png", fullPage: true });
  await context.clearCookies();
  await login(page, "fixture-b@example.com");
  await expect(saved.getByRole("link")).toHaveText(["B restaurant"]);
  await expect(saved).not.toContainText("A coffee shop");
});

test("keeps newly saved analyses in the sidebar after returning to a previous workspace", async ({
  page,
}) => {
  await login(page, "creation-fixture@example.com");
  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  for (const name of ["History first analysis", "History second analysis"]) {
    await page.getByRole("link", { name: "New Target", exact: true }).click();
    await page.getByLabel("Target name *").fill(name);
    await page
      .getByLabel("Google Maps URL *")
      .fill("https://www.google.com/maps/place/History+Fixture");
    await page.getByRole("button", { name: "Create target" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(saved.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("History first analysis");
  await expect(
    saved.getByRole("link", { name: "History second analysis", exact: true }),
  ).toBeVisible();
});

test("removes sidebar names after sign-out and never renders a foreign analysis name", async ({
  page,
  context,
}) => {
  await login(page, "fixture@example.com");
  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  const ownedAnalysis = saved.getByRole("link", { name: "A coffee shop", exact: true });
  const ownedHref = await ownedAnalysis.getAttribute("href");
  await ownedAnalysis.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await page.getByRole("button", { name: "fixture@example.com", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.goBack();
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  await expect(saved).toHaveCount(0);
  // Next retains inactive route trees in hidden Activity boundaries. Check the
  // rendered page here; the separate authenticated HTTP check below covers data isolation.
  await expect.poll(() => page.locator("body").innerText()).not.toContain("A coffee shop");

  await login(page, "fixture-b@example.com");
  const foreignPage = await context.request.get(ownedHref!);
  const foreignPayload = await foreignPage.text();
  expect(foreignPayload).not.toContain("A coffee shop");
  expect(foreignPayload).not.toContain("Saved review for A coffee shop");
  await page.goto(ownedHref!);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This target isn't available to your account.",
  );
  await expect(saved.getByRole("link")).toHaveText(["B restaurant"]);
  await expect(page.locator("body")).not.toContainText("A coffee shop");
  await expect(page.locator("body")).not.toContainText("Saved review for A coffee shop");
});
