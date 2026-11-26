import { expect, test, type Page } from "@playwright/test";

const target = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
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

test("confirms owned deletion, retries failure, denies other users and removes the saved analysis", async ({
  page,
  browser,
}) => {
  await login(page, "deletion-fixture@example.com");
  await page.goto(`/analysis-targets/${target}`);
  await expect(page.getByRole("heading", { name: "Deletion fixture", level: 1 })).toBeVisible();
  await expect(page.getByText("Saved review for Deletion fixture", { exact: true })).toBeVisible();
  const other = await browser.newContext();
  try {
    const b = await other.newPage();
    await login(b, "fixture-b@example.com");
    const denied = await b.request.delete(
      `/api/analysis-targets/${target}?ownerId=00000000-0000-4000-8000-000000000016`,
    );
    expect(denied.status()).toBe(404);
    await page.setViewportSize({ width: 375, height: 812 });
    const trigger = page.getByRole("button", { name: "Delete analysis", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Delete analysis?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.screenshot({ path: "test-results/s3-005-delete-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "test-results/s3-005-delete-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await page.request.get(`/api/analysis-targets/${target}/reviews`)).status()).toBe(200);
    let first = true;
    await page.route(`**/api/analysis-targets/${target}`, async (route) => {
      if (route.request().method() === "DELETE" && first) {
        first = false;
        await route.fulfill({
          status: 500,
          json: { success: false, error: { message: "SECRET_DATABASE_DETAIL" } },
        });
      } else await route.continue();
    });
    await trigger.click();
    await dialog.getByRole("button", { name: "Permanently delete" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "We couldn't delete this analysis. Please try again.",
    );
    await expect(page.locator("body")).not.toContainText("SECRET_DATABASE_DETAIL");
    expect((await page.request.get(`/api/analysis-targets/${target}/reviews`)).status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const deletion = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/analysis-targets/${target}`) &&
        response.request().method() === "DELETE",
    );
    await dialog.getByRole("button", { name: "Permanently delete" }).click();
    const deleted = await deletion;
    // A successful response immediately replaces the document. Its body may no longer be
    // available to DevTools; the UI validates that envelope before navigating.
    expect(deleted.status()).toBe(200);
    await expect(page).toHaveURL("/analysis-targets");
    await expect(page.getByRole("region", { name: "Saved analyses" })).toContainText(
      "No saved analyses yet.",
    );
    await expect(page.getByRole("region", { name: "Saved analyses" })).not.toContainText(
      "Deletion fixture",
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Targets", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Deletion fixture" })).toHaveCount(0);
    expect((await page.request.get(`/api/analysis-targets/${target}/reviews`)).status()).toBe(404);
    expect((await page.request.delete(`/api/analysis-targets/${target}`)).status()).toBe(404);
    expect(
      (
        await b.request.get("/api/analysis-targets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/reviews")
      ).status(),
    ).toBe(200);
    await page.goto(`/analysis-targets/${target}`);
    await expect(
      page.getByText("This target isn't available to your account. Go back to My Targets."),
    ).toBeVisible();
    await other.clearCookies();
    expect((await b.request.delete(`/api/analysis-targets/${target}`)).status()).toBe(401);
  } finally {
    await other.close();
  }
});
