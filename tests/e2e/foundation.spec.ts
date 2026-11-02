import { expect, test } from "@playwright/test";

test.describe("application foundation", () => {
  test("serves the ReviewLens starter page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("ReviewLens AI");
    await expect(page.getByRole("heading", { level: 1, name: "ReviewLens AI" })).toBeVisible();
    await expect(page.getByText("Application foundation operational")).toBeVisible();
  });

  test("serves a healthy API response", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "ok" },
    });
  });
});
