import { expect, test } from "@playwright/test";

test("registration requirements update live and keyboard password visibility never submits the form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/login") submissions++;
  });
  await page.goto("/login");
  await expect(page.getByRole("list", { name: "Password requirements" })).toHaveCount(0);
  const access = page.getByRole("group", { name: "Account access" });
  await access.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByLabel("Email *").fill("visibility@example.test");
  const password = page.getByLabel("Password *");
  const requirements = page.getByRole("list", { name: "Password requirements" });
  const items = requirements.getByRole("listitem");
  await expect(items).toHaveCount(5);
  await expect(items.filter({ hasText: /^Not met:/ })).toHaveCount(5);

  await password.fill("abcdefgh");
  await expect(items.filter({ hasText: /^Met:/ })).toHaveCount(2);
  await password.fill("Abcdef1!");
  await expect(items.filter({ hasText: /^Met:/ })).toHaveCount(5);
  const describedBy = await password.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  expect(await requirements.evaluate((element) => element.parentElement?.id)).toBe(describedBy);

  await password.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("Abcdef1!");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("Abcdef1!");
  expect(submissions).toBe(0);

  await password.fill("Abcdef1 ");
  await expect(items.filter({ hasText: "One symbol" })).toHaveText(/^Not met:/);
  await password.fill("bcdef1!");
  await expect(items.filter({ hasText: "At least 8 characters" })).toHaveText(/^Not met:/);
  await expect(items.filter({ hasText: "One uppercase letter" })).toHaveText(/^Not met:/);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);

  await page.getByRole("button", { name: "Show password" }).click();
  await access.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(password).toHaveValue("");
  await expect(password).toHaveAttribute("type", "password");
  await expect(requirements).toHaveCount(0);
  await page.getByLabel("Email *").fill("fixture@example.com");
  await password.fill("dummy-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL("/analysis-targets");
});
