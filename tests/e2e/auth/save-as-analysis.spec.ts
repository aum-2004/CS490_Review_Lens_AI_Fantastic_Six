import { expect, test, type Page } from "@playwright/test";

// S3-003: Save As opens an independent copy with the same saved data, and later changes to the copy
// (rename, delete) never change the original. Uses a dedicated fixture account.
const source = "f5000000-0000-4000-8000-000000000001";

/** Retained (hidden) workspaces stay in the DOM after client navigation; match the visible one. */
function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

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

test("saves an independent copy, opens it with the same data, and leaves the original unchanged", async ({
  page,
  browser,
}) => {
  await login(page, "save-as-fixture@example.com");
  await page.goto(`/analysis-targets/${source}`);
  await expect(page.getByRole("heading", { name: "Save As bakery", level: 1 })).toBeVisible();
  await expect(visibleText(page, "Saved review for Save As bakery")).toBeVisible();

  await page.getByRole("button", { name: "Save as new analysis" }).click();
  const name = page.getByLabel("New analysis name *");
  await expect(name).toHaveValue("Save As bakery (copy)");
  await expect(name).toBeFocused();
  await expect(page.getByText(/Q&A history isn't copied/)).toBeVisible();

  await name.fill("   ");
  await page.getByRole("button", { name: "Save copy" }).click();
  await expect(
    page.getByRole("form", { name: "Save as new analysis" }).getByRole("alert"),
  ).toContainText("Enter a name for this target.");
  await expect(page).toHaveURL(`/analysis-targets/${source}`);

  await name.fill("  Weekend shortlist  ");
  await page.getByRole("button", { name: "Save copy" }).click();
  await expect(page.getByRole("heading", { name: "Weekend shortlist", level: 1 })).toBeVisible();
  const copyPath = new URL(page.url()).pathname;
  expect(copyPath).toMatch(/^\/analysis-targets\/f5000000-/);
  expect(copyPath).not.toBe(`/analysis-targets/${source}`);
  // The copy starts with the source's saved reviews and ingestion state.
  await expect(visibleText(page, "Saved review for Save As bakery")).toBeVisible();
  await expect(visibleText(page, "Ingested").first()).toBeVisible();

  const saved = page.getByRole("navigation", { name: "Saved analyses" });
  await expect(saved.getByRole("link", { name: "Save As bakery", exact: true })).toBeVisible();
  await expect(saved.getByRole("link", { name: "Weekend shortlist", exact: true })).toBeVisible();

  // Renaming the copy does not rename the original.
  await page.getByRole("button", { name: "Rename analysis" }).click();
  await page.getByLabel("Analysis name *").fill("Weekend renamed");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { name: "Weekend renamed", level: 1 })).toBeVisible();
  await page.goto(`/analysis-targets/${source}`);
  await expect(page.getByRole("heading", { name: "Save As bakery", level: 1 })).toBeVisible();

  // Another user cannot open the copy.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, "fixture-b@example.com");
  await otherPage.goto(copyPath);
  await expect(otherPage.getByText("This target isn't available to your account.")).toBeVisible();
  const denied = await otherPage.request.post(`/api/analysis-targets/${source}/save-as`, {
    data: { name: "Stolen copy" },
  });
  expect(denied.status()).toBe(404);
  await other.close();

  // Deleting the copy keeps the original and its reviews.
  await page.goto(copyPath);
  await page.getByRole("button", { name: "Delete analysis", exact: true }).click();
  await page.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await expect(page).toHaveURL("/analysis-targets");
  await page.goto(`/analysis-targets/${source}`);
  await expect(page.getByRole("heading", { name: "Save As bakery", level: 1 })).toBeVisible();
  await expect(visibleText(page, "Saved review for Save As bakery")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Saved analyses" })
      .getByRole("link", { name: "Weekend renamed" }),
  ).toHaveCount(0);
});
