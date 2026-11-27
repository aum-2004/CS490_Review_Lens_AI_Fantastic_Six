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

test("renames on mobile and desktop, persists after reload, and preserves source, reviews and Q&A draft", async ({
  page,
  context,
}) => {
  await page.route("**/api/analysis-targets/*/questions", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          outcome: "answered",
          answer: "Saved coffee answer.",
          citedReviewIds: ["cccccccc-cccc-4ccc-8ccc-ccccccccccc1"],
        },
      },
    }),
  );
  await login(page, "fixture@example.com");
  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  await saved.getByRole("link", { name: "A coffee shop", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  const path = new URL(page.url()).pathname;
  const source = await page
    .getByRole("link", { name: /https:\/\// })
    .last()
    .getAttribute("href");
  const reviewText = await page
    .getByRole("heading", { name: "Reviews", exact: true })
    .locator("..")
    .textContent();
  const question = page.getByRole("textbox", { name: /question/i });
  await question.fill("What do reviewers like?");
  await page.getByRole("button", { name: "Ask question", exact: true }).click();
  await expect(page.getByText("Saved coffee answer.", { exact: true })).toBeVisible();
  await question.fill("What do reviews say about service?");
  await page.getByRole("button", { name: "Rename analysis" }).click();
  await expect(page.getByLabel("Analysis name *")).toHaveValue("A coffee shop");
  await page.getByLabel("Analysis name *").fill("   ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("form", { name: "Rename analysis" }).getByRole("alert"),
  ).toContainText("Enter a name for this target.");
  await expect(page.getByLabel("Analysis name *")).toBeFocused();
  await page.getByLabel("Analysis name *").fill("x".repeat(121));
  await expect(
    page.getByRole("form", { name: "Rename analysis" }).getByRole("alert"),
  ).toContainText("120 characters");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel("Analysis name *").fill("Cancelled draft");
  await expect(page.getByRole("form", { name: "Rename analysis" }).getByRole("alert")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  await page.getByRole("button", { name: "Rename analysis" }).click();
  const newName = "Melissa's cafe'); DROP TABLE reviews;--";
  await page.getByLabel("Analysis name *").fill(`  ${newName}  `);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(newName);
  await expect(page.getByRole("button", { name: "Rename analysis" })).toBeFocused();
  await expect(saved.getByRole("link", { name: newName, exact: true })).toHaveAttribute(
    "href",
    path,
  );
  await expect(question).toHaveValue("What do reviews say about service?");
  await expect(page.getByText("Saved coffee answer.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reviews", exact: true }).locator(".."),
  ).toHaveText(reviewText!);
  expect(
    await page
      .getByRole("link", { name: /https:\/\// })
      .last()
      .getAttribute("href"),
  ).toBe(source);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/s3-002-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(newName);
  await page.screenshot({ path: "test-results/s3-002-desktop.png", fullPage: true });
  await context.clearCookies();
  await login(page, "fixture-b@example.com");
  const denied = await page.request.patch(`/api${path}`, { data: { name: "Stolen" } });
  expect(denied.status()).toBe(404);
  await expect(saved).not.toContainText(newName);
  await context.clearCookies();
  await login(page, "fixture@example.com");
  await saved.getByRole("link", { name: newName, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(newName);
  const restored = await page.request.patch(`/api${path}`, { data: { name: "A coffee shop" } });
  expect(restored.ok()).toBe(true);
});

test("retains failed edits for retry and renders HTML-looking names as text", async ({ page }) => {
  await login(page, "fixture@example.com");
  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  await saved.getByRole("link", { name: "A coffee shop", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
  const path = new URL(page.url()).pathname;
  let failures = 1;
  await page.route(`**/api${path}`, async (route) => {
    if (route.request().method() === "PATCH" && failures-- > 0) {
      await route.fulfill({
        status: 500,
        json: { success: false, error: { message: "private-database-diagnostics" } },
      });
    } else await route.continue();
  });
  const name = '<img src=x onerror="window.__renameXss=1">';
  try {
    await page.getByRole("button", { name: "Rename analysis" }).click();
    await page.getByLabel("Analysis name *").fill(name);
    await page.getByRole("button", { name: "Save name" }).click();
    const error = page.getByRole("form", { name: "Rename analysis" }).getByRole("alert");
    await expect(error).toContainText("We couldn't rename this analysis. Please try again.");
    await expect(error).not.toContainText("private-database-diagnostics");
    await expect(page.getByLabel("Analysis name *")).toHaveValue(name);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A coffee shop");
    await expect(saved.getByRole("link", { name: "A coffee shop", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.getByRole("heading", { level: 1 }).locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, "__renameXss"))).toBeUndefined();
    await page.goBack();
    await expect(page).toHaveURL("/analysis-targets");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My Targets");
    await expect(saved.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Your analysis targets" })).toContainText(name);
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(saved.getByRole("link", { name, exact: true })).toBeVisible();
  } finally {
    await page.unroute(`**/api${path}`);
    expect(
      (await page.request.patch(`/api${path}`, { data: { name: "A coffee shop" } })).ok(),
    ).toBe(true);
  }
});
