import { expect, test } from "@playwright/test";

const targetId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const citedIds = Array.from(
  { length: 6 },
  (_, index) => `d1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

test("explores the complete cited subset with keyboard controls on desktop and mobile", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route("**/api/analysis-targets/*/questions", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          targetId,
          outcome: "answered",
          answer: `Supported observation [${citedIds[5]}].`,
          citedReviewIds: citedIds,
        },
      },
    }),
  );
  await page.goto(`/login?next=${encodeURIComponent(`/analysis-targets/${targetId}`)}`);
  await page.getByLabel("Email *").fill("supporting-fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(`/analysis-targets/${targetId}`, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evidence studio");
  const questions = page.getByRole("region", { name: "Review questions" });
  await questions.getByLabel(/Question/).fill("What stands out?");
  await questions.getByRole("button", { name: "Ask question" }).click();
  await expect(questions).toContainText("Supported observation [6].");
  await expect(questions).toContainText("not the complete saved review dataset");
  await expect(
    questions.getByRole("list", { name: "Supporting Reviews", exact: true }).getByRole("listitem"),
  ).toHaveCount(3);
  // The full dataset includes review 7; this answer cites only reviews 1–6.
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Evidence studio saved review 7.",
  );
  const summary = questions.locator("summary");
  const all = questions.getByRole("list", { name: "All supporting reviews", exact: true });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(all).not.toBeVisible();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(all).toBeVisible();
    await expect(all.getByRole("listitem")).toHaveCount(6);
    await expect(all).toContainText("[6] 4 out of 5");
    await expect(all).toContainText("Evidence studio saved review 6.");
    await expect(all).toContainText("2026-11-01");
    await expect(all).not.toContainText("Evidence studio saved review 7.");
    await expect(all).not.toContainText("Fixture reviewer");
    await expect(all).not.toContainText(citedIds[5]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await summary.focus();
    await page.screenshot({
      path: `test-results/s3-014-supporting-reviews-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Space");
    await expect(all).not.toBeVisible();
  }
  await summary.click();
  await page.reload();
  await expect(questions.locator("summary")).toHaveCount(0);
});
