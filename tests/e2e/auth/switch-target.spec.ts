import { expect, test, type Page } from "@playwright/test";

const bakery = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const coffee = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const fixtureReview = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

async function login(page: Page, email = "fixture@example.com") {
  await page.goto(`/login?next=${encodeURIComponent(`/analysis-targets/${bakery}`)}`);

  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill("dummy-password");

  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();

  // Verify successful login for the main test account.
  // The second test uses another account to check access denial.
  if (email === "fixture@example.com") {
    await expect(page).toHaveURL(`/analysis-targets/${bakery}`, { timeout: 15000 });

    await expect(page.getByRole("heading", { name: "A bakery", level: 1 })).toBeVisible();
  }
}

test("switches owned targets with keyboard navigation and updates all active context", async ({
  page,
}) => {
  test.setTimeout(90000);

  const requests: string[] = [];
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    const targetId = route.request().url().includes(bakery) ? bakery : coffee;
    requests.push(targetId);
    await route.fulfill({
      json: {
        success: true,
        data: {
          targetId,
          outcome: "answered",
          answer: targetId === bakery ? "Bakery answer." : "Coffee answer.",
          citedReviewIds: [fixtureReview],
        },
      },
    });
  });
  await login(page);
  const qa = page.getByRole("region", { name: "Review questions" });
  const ingestion = page.getByRole("region", { name: "Target ingestion" });
  const summary = page.getByRole("region", { name: "Review summary" });
  await expect(summary).toContainText("Active target: A bakery · Google Maps");
  await expect(summary).toContainText("4.0 / 5");
  await qa.getByLabel(/Question/).fill("What do reviewers like?");
  await qa.getByRole("button", { name: "Ask question" }).click();
  await expect(qa).toContainText("Bakery answer.");
  const switcher = page.getByRole("button", { name: /^Switch target:/ });
  await switcher.focus();
  await page.keyboard.press("Enter");
  const nav = page.getByRole("navigation", { name: "Switch analysis target" });
  await expect(nav.getByRole("link", { name: /^A bakery \(active\)/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: /^A bakery \(active\)/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(switcher).toBeFocused();
  await expect(nav).toBeHidden();
  await page.keyboard.press("Enter");
  const next = nav.getByRole("link", { name: /^A coffee shop / });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/analysis-targets/${coffee}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await expect(ingestion).toContainText("Active target: A coffee shop · Google Maps");
  await expect(qa).toContainText("Active target: A coffee shop · Google Maps");
  await expect(summary).toContainText("Active target: A coffee shop · Google Maps");
  await expect(summary).not.toContainText("A bakery");
  await expect(qa).not.toContainText("Bakery answer.");
  await expect(qa.getByLabel(/Question/)).toHaveValue("");
  await expect(page.getByRole("list", { name: "Saved reviews" })).not.toContainText(
    "Saved review for A bakery",
  );
  await qa.getByLabel(/Question/).fill("What do reviewers like?");
  await qa.getByRole("button", { name: "Ask question" }).click();
  await expect(qa).toContainText("Coffee answer.");
  expect(requests).toEqual([bakery, coffee]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await expect(qa).not.toContainText("Coffee answer.");
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: /^Switch target:/ }).click();
    await expect(nav.getByRole("link", { name: /^A coffee shop \(active\)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/s2-017-switch-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: /^Switch target:/ }).click();
  }
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  await expect(summary).toContainText("Active target: A bakery · Google Maps");
  await expect(qa.getByLabel(/Question/)).toHaveValue("");
  await expect(qa).not.toContainText("Coffee answer.");
});

test("does not list or open another user's targets", async ({ page }) => {
  await login(page, "fixture-b@example.com");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This target isn't available to your account.",
  );
  await expect(page.getByRole("button", { name: /^Switch target:/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to My Targets" }).click();
  await page.getByRole("link", { name: /Open / }).click();
  await page.getByRole("button", { name: /^Switch target:/ }).click();
  const nav = page.getByRole("navigation", { name: "Switch analysis target" });
  await expect(nav).not.toContainText("A bakery");
  await expect(nav).not.toContainText("A coffee shop");
  await expect(nav.getByText("You have no other targets yet.")).toBeVisible();
});
