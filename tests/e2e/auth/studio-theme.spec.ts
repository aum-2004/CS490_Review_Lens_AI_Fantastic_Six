import { expect, test } from "@playwright/test";

const target = "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

test("Analyst Studio keeps the selected theme across routes, reloads, and mobile", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`/login?next=${encodeURIComponent(target)}`);
  const signInToggle = page.getByRole("button", { name: "Dark mode" });
  await expect(page.getByLabel("Email *")).toHaveCSS("border-top-color", "rgb(129, 144, 167)");
  await signInToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Email *")).toHaveCSS("border-top-color", "rgb(102, 117, 140)");
  await signInToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(target);
  await expect(page.getByRole("link", { name: "RL home" })).toHaveText("RL");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 247, 251)");
  await page.screenshot({
    path: "test-results/studio-light-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  const toggle = page.getByRole("button", { name: "Dark mode" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(20, 25, 34)");
  await expect(page.getByRole("button", { name: /^Switch target:/ })).toHaveCSS(
    "background-color",
    "rgb(28, 35, 48)",
  );
  await page.screenshot({
    path: "test-results/studio-dark-desktop.png",
    fullPage: true,
    caret: "initial",
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "My Targets", exact: true })
    .click();
  await expect(page).toHaveURL("/analysis-targets");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 247, 251)");
  await page.goto(target);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A bakery");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "test-results/studio-light-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await toggle.click();
  await expect(page.getByRole("button", { name: /^Switch target:/ })).toHaveCSS(
    "background-color",
    "rgb(28, 35, 48)",
  );
  await page.screenshot({
    path: "test-results/studio-dark-mobile.png",
    fullPage: true,
    caret: "initial",
  });
});

test("ignores a poisoned stored theme and renders answer markup as text", async ({ page }) => {
  const payload =
    '<img id="reviewlens-injected" src=x onerror="document.documentElement.dataset.injected=1">';
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript((value) => localStorage.setItem("reviewlens-theme", value), payload);
  await page.goto(`/login?next=${encodeURIComponent(target)}`);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("#reviewlens-injected")).toHaveCount(0);
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(target);
  await page.route("**/api/analysis-targets/*/questions", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { targetId: target.split("/").pop(), outcome: "answered", answer: payload },
      },
    }),
  );
  const question = page.getByRole("textbox", { name: /Question/ });
  await question.fill("What stands out?");
  await question.press("Shift+Enter");
  await expect(question).toHaveValue("What stands out?\n");
  await question.press("Enter");
  await expect(page.getByRole("region", { name: "Review questions" })).toContainText(payload);
  await expect(page.locator("#reviewlens-injected")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-injected");
});
