import { expect, test } from "@playwright/test";

test.describe("application foundation", () => {
  test("routes home to authentication or the protected target list", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/(?:login|analysis-targets)(?:\?|$)/);
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
