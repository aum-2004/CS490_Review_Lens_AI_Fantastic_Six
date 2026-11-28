import { expect, test, type Page } from "@playwright/test";

const bakery = "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const coffee = "/analysis-targets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

async function login(page: Page) {
  await page.goto(`/login?next=${encodeURIComponent(bakery)}`);
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(bakery);
}

test("combined rating and date filters, Apply, Cancel, Clear all, and zero matches", async ({
  page,
}) => {
  await login(page);
  const filters = page.getByRole("form", { name: "Review filters" });
  const count = page.getByText("1 matching review");
  await filters.getByLabel("Minimum rating").fill("4");
  await filters.getByLabel("Start date").fill("2026-11-01");
  await filters.getByLabel("End date").fill("2026-11-01");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(count).toBeVisible();
  await expect(page.getByRole("list", { name: "Review preview entries" })).toContainText(
    "Saved review for A bakery",
  );
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Saved review for A bakery",
  );

  await filters.getByLabel("End date").fill("2026-11-02");
  await filters.getByRole("button", { name: "Cancel" }).click();
  await expect(filters.getByLabel("End date")).toHaveValue("2026-11-01");
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Saved review for A bakery",
  );

  await filters.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("1 matching review")).toBeVisible();
  await expect(page.locator('[aria-label="Active filters"]:visible')).toHaveCount(0);

  await filters.getByLabel("Minimum rating").fill("5");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("0 matching reviews")).toBeVisible();
  await expect(page.getByText("No reviews match these filters.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Saved reviews" })).toHaveCount(0);
});

test("switching workspace targets resets applied filters and shows only the new target reviews", async ({
  page,
}) => {
  await login(page);
  const filters = page.getByRole("form", { name: "Review filters" });
  await filters.getByLabel("Minimum rating").fill("5");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No reviews match these filters.")).toBeVisible();

  await page.getByRole("button", { name: /^Switch target:/ }).click();
  await page
    .getByRole("navigation", { name: "Switch analysis target" })
    .getByRole("link", { name: /^A coffee shop/ })
    .click();
  await expect(page).toHaveURL(coffee);
  await expect(page.getByText("1 matching review")).toBeVisible();
  await expect(page.locator('[aria-label="Active filters"]:visible')).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Saved reviews" })).toContainText(
    "Saved review for A coffee shop",
  );
  await expect(page.getByRole("main")).not.toContainText("Saved review for A bakery");
});
