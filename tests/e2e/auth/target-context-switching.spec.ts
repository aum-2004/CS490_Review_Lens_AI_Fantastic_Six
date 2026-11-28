import { expect, test, type Page } from "@playwright/test";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const fixtureReview = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
async function login(page: Page) {
  await page.goto("/login?next=" + encodeURIComponent("/analysis-targets/" + A));
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
}
async function switchB(page: Page) {
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Targets" })
    .click();
  await page.getByRole("link", { name: "Open A coffee shop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
}
async function ask(page: Page, question = "What do reviewers say?") {
  await page.getByRole("textbox", { name: /Question/ }).fill(question);
  await page.getByRole("button", { name: "Ask question" }).click();
}
test("real navigation switches the active label, question URL and visible answer", async ({
  page,
}) => {
  const requests: { target: string; body: unknown }[] = [];
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    const id = route.request().url().split("/").at(-2)!;
    requests.push({ target: id, body: route.request().postDataJSON() });
    await route.fulfill({
      json: {
        success: true,
        data: {
          targetId: id,
          outcome: "answered",
          answer: id === A ? "ALPHA battery life" : "BETA customer service",
          citedReviewIds: [fixtureReview],
        },
      },
    });
  });
  await login(page);
  await ask(page);
  await expect(
    page
      .getByRole("region", { name: "Review questions" })
      .getByText("ALPHA battery life", { exact: true }),
  ).toBeVisible();
  await switchB(page);
  await expect(
    page.locator('[aria-labelledby="review-summary-title"]').filter({ visible: true }),
  ).toContainText("Status unavailable");
  await expect(
    page.getByRole("region", { name: "Review questions" }).getByText(/Active target:/),
  ).toContainText("A coffee shop");
  await expect(
    page
      .getByRole("region", { name: "Review questions" })
      .getByText("ALPHA battery life", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: /Question/ })).toHaveValue("");
  await expect(
    page
      .getByRole("list", { name: "Saved reviews" })
      .getByText("Saved review for A coffee shop", { exact: true }),
  ).toBeVisible();
  await ask(page);
  await expect(
    page
      .getByRole("region", { name: "Review questions" })
      .getByText("BETA customer service", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Targets" })
    .click();
  await page.getByRole("link", { name: "Open A bakery" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  await expect(page.getByRole("region", { name: "Review summary" })).toContainText("Ingested");
  await expect(
    page
      .getByRole("region", { name: "Review questions" })
      .getByText("BETA customer service", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("textbox", { name: /Question/ })).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("region", { name: "Review summary" })).toContainText("4.0 / 5");
  await ask(page);
  expect(requests).toEqual([
    { target: A, body: { question: "What do reviewers say?" } },
    { target: B, body: { question: "What do reviewers say?" } },
    { target: A, body: { question: "What do reviewers say?" } },
  ]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  await expect(
    page
      .getByRole("region", { name: "Review questions" })
      .getByText("BETA customer service", { exact: true }),
  ).not.toBeVisible();
});
test("pending A response cannot populate B after client navigation", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((yes) => {
    release = yes;
  });
  let started = false;
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    const id = route.request().url().split("/").at(-2)!;
    if (id === A) {
      started = true;
      await gate;
    }
    await route
      .fulfill({
        json: {
          success: true,
          data: {
            targetId: id,
            outcome: "answered",
            answer: id === A ? "ALPHA late battery answer" : "BETA current service answer",
            citedReviewIds: [fixtureReview],
          },
        },
      })
      .catch(() => {});
  });
  await login(page);
  await ask(page);
  await expect.poll(() => started).toBe(true);
  await switchB(page);
  await ask(page);
  await expect(page.getByText("BETA current service answer", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("ALPHA late battery answer", { exact: true })).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Review questions" }).getByText(/Active target:/),
  ).toContainText("A coffee shop");
});
