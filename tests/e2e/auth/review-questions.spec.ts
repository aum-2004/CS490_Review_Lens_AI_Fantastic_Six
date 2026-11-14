import { expect, test, type Page } from "@playwright/test";

const bakery = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
async function login(page: Page) {
  await page.goto(`/login?next=${encodeURIComponent(`/analysis-targets/${bakery}`)}`);
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
}

test("asks from the active workspace, shows processing and resets after switching targets", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const bodies: unknown[] = [];
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    bodies.push(route.request().postDataJSON());
    await gate;
    await route.fulfill({
      json: {
        success: true,
        data: { targetId: bakery, outcome: "answered", answer: "Reviewers enjoy the bread." },
      },
    });
  });
  await login(page);
  const card = page.getByRole("region", { name: "Review questions" });
  await expect(card).toContainText("A bakery");
  await card.getByLabel(/Question/).fill("  What do customers enjoy?  ");
  await card.getByLabel(/Question/).press("Enter");
  await expect(card.getByRole("button", { name: /Asking/ })).toBeDisabled();
  await expect(card.getByRole("status")).toContainText("processing your question for A bakery");
  release();
  await expect(card).toContainText("Reviewers enjoy the bread.");
  expect(bodies).toEqual([{ question: "What do customers enjoy?" }]);
  await page.screenshot({ path: "test-results/s2-009-desktop.png", fullPage: true });
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Targets" })
    .click();
  await page.getByRole("link", { name: "Open A coffee shop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await expect(card).not.toContainText("Reviewers enjoy the bread.");
  await expect(card.getByLabel(/Question/)).toHaveValue("");
  await expect(card).toContainText("A coffee shop");
});

test("retains failed questions, allows retry and fits a 375px viewport", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    calls++;
    await route.fulfill(
      calls === 1
        ? { status: 503, json: { error: { message: "PRIVATE_PROVIDER_DIAGNOSTIC" } } }
        : {
            json: {
              success: true,
              data: {
                targetId: bakery,
                outcome: "insufficient_evidence",
                answer: "The saved reviews do not mention parking.",
              },
            },
          },
    );
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const card = page.getByRole("region", { name: "Review questions" });
  await card.getByLabel(/Question/).fill("Is parking available?");
  await card.getByRole("button", { name: "Ask question" }).click();
  await expect(card.getByRole("alert")).toContainText("Please try again later");
  await expect(card.getByLabel(/Question/)).toHaveValue("Is parking available?");
  await expect(card).not.toContainText("PRIVATE_PROVIDER_DIAGNOSTIC");
  await card.getByRole("button", { name: "Ask question" }).click();
  await expect(card.getByRole("heading", { name: "Insufficient review evidence" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/s2-009-mobile.png", fullPage: true });
});

test("the actual questions route fails safely with paid calls disabled", async ({ page }) => {
  await login(page);
  const card = page.getByRole("region", { name: "Review questions" });
  await card.getByLabel(/Question/).fill("What do reviewers like?");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/analysis-targets/${bakery}/questions`) &&
      response.request().method() === "POST",
  );
  await card.getByRole("button", { name: "Ask question" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "QA_DISABLED" } });
  await expect(card.getByRole("alert")).toContainText("Review Q&A is temporarily unavailable.");
  await expect(card.getByRole("button", { name: "Ask question" })).toBeEnabled();
});

test("explains the account quota and preserves the question", async ({ page }) => {
  await page.route("**/api/analysis-targets/*/questions", (route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "86400" },
      json: { success: false, error: { code: "QA_DAILY_LIMIT", message: "PRIVATE_DIAGNOSTIC" } },
    }),
  );
  await login(page);
  const card = page.getByRole("region", { name: "Review questions" });
  await card.getByLabel(/Question/).fill("What do reviewers like?");
  await card.getByRole("button", { name: "Ask question" }).click();
  await expect(card.getByRole("alert")).toContainText("limit of five questions in 24 hours");
  await expect(card.getByLabel(/Question/)).toHaveValue("What do reviewers like?");
  await expect(card).not.toContainText("PRIVATE_DIAGNOSTIC");
});
