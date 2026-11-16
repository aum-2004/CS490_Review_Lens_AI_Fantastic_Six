import { expect, test, type Page } from "@playwright/test";

const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const b = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const card = (page: Page) => page.getByRole("region", { name: "Review questions" });
async function login(page: Page, email = "fixture@example.com", target = a) {
  await page.goto("/login?next=" + encodeURIComponent("/analysis-targets/" + target));
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
}
async function switchToB(page: Page) {
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Targets" })
    .click();
  await page.getByRole("link", { name: "Open A coffee shop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
}
async function ask(page: Page, question: string) {
  await card(page).getByRole("textbox", { name: "Question" }).fill(question);
  await card(page).getByRole("button", { name: "Ask question" }).click();
}

test("history and refresh never restore another visit's answers or question drafts", async ({
  page,
}) => {
  const targets: string[] = [];
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    const targetId = route.request().url().split("/").at(-2)!;
    targets.push(targetId);
    expect(Object.keys(route.request().postDataJSON())).toEqual(["question"]);
    await route.fulfill({
      json: {
        success: true,
        data: { targetId, outcome: "answered", answer: "ANSWER_" + targetId },
      },
    });
  });
  await login(page);
  await ask(page, "A question");
  await expect(card(page)).toContainText("ANSWER_" + a);
  await switchToB(page);
  await ask(page, "B question");
  await expect(card(page)).toContainText("ANSWER_" + b);
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  await expect(card(page)).not.toContainText("ANSWER_");
  await expect(card(page).getByRole("textbox", { name: "Question" })).toHaveValue("");
  await ask(page, "A again");
  await expect(card(page)).toContainText("ANSWER_" + a);
  expect(targets).toEqual([a, b, a]);
  await page.goForward();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await expect(card(page)).not.toContainText("ANSWER_");
  await ask(page, "B again");
  await expect(card(page)).toContainText("ANSWER_" + b);
  await page.reload();
  await expect(card(page)).not.toContainText("ANSWER_");
  await expect(card(page).getByRole("textbox", { name: "Question" })).toHaveValue("");
});

for (const lateStatus of [200, 401]) {
  test("ignores delayed A response " + lateStatus + " across A -> B -> A", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    await page.route("**/api/analysis-targets/*/questions", async (route) => {
      const targetId = route.request().url().split("/").at(-2)!;
      const old = first;
      first = false;
      if (old) await gate;
      await route
        .fulfill({
          status: old ? lateStatus : 200,
          json: {
            success: true,
            data: { targetId, outcome: "answered", answer: old ? "STALE_A" : "CURRENT_ANSWER" },
          },
        })
        .catch(() => {
          /* The old browser fetch may already be aborted. */
        });
    });
    await login(page);
    const started = page.waitForRequest("**/api/analysis-targets/" + a + "/questions");
    await ask(page, "Old A");
    await started;
    await switchToB(page);
    await ask(page, "New B");
    await expect(card(page)).toContainText("CURRENT_ANSWER");
    await page.goBack();
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
    await expect(card(page).getByRole("button", { name: "Ask question" })).toBeEnabled();
    release();
    await ask(page, "New A");
    await expect(card(page)).toContainText("CURRENT_ANSWER");
    await expect(card(page)).not.toContainText("STALE_A");
    await expect(page).toHaveURL(new RegExp("/analysis-targets/" + a + "$"));
  });
}

test("logout while pending clears Q&A before another account uses the browser", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/analysis-targets/*/questions", async (route) => {
    const targetId = route.request().url().split("/").at(-2)!;
    if (targetId === a) await gate;
    await route
      .fulfill({
        json: {
          success: true,
          data: {
            targetId,
            outcome: "answered",
            answer: targetId === a ? "PRIVATE_OLD_ACCOUNT" : "CURRENT_ACCOUNT_ANSWER",
          },
        },
      })
      .catch(() => {});
  });
  await login(page);
  const started = page.waitForRequest("**/api/analysis-targets/" + a + "/questions");
  await ask(page, "Private old draft");
  await started;
  await page.getByRole("button", { name: "fixture@example.com", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  await page.goBack();
  await expect(card(page)).toHaveCount(0);
  release();
  // Back may land on the public page preceding login, not the login form.
  await page.goto("/login");
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email *").fill("fixture-b@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("form", { name: "Sign in" })).not.toBeVisible();
  await page.goto("/analysis-targets/" + a);
  await expect(page.getByRole("main")).toContainText("This target isn't available to your account");
  await expect(page.getByRole("main")).not.toContainText("PRIVATE_OLD_ACCOUNT");
  await expect(card(page)).toHaveCount(0);
  await page.goto("/analysis-targets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1");
  await expect(card(page)).not.toContainText("PRIVATE_OLD_ACCOUNT");
  await expect(card(page).getByRole("textbox", { name: "Question" })).toHaveValue("");
  await ask(page, "New account question");
  await expect(card(page)).toContainText("CURRENT_ACCOUNT_ANSWER");
});
