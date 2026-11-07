import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test("development login keeps typed input when generated files change", async ({ page }) => {
  let forcedReloads = 0;
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      try {
        if (JSON.parse(String(payload)).type === "reloadPage") forcedReloads++;
      } catch {
        // Other WebSocket frames do not participate in the HMR reload check.
      }
    });
  });
  await page.goto("/login?next=%2Fanalysis-targets");
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-password");
  const reloadsBeforeObservation = forcedReloads;

  // Generated output must not invalidate the application's Tailwind source scan.
  const sentinel = test.info().outputPath("watch-sentinel.txt");
  await mkdir(path.dirname(sentinel), { recursive: true });
  await writeFile(sentinel, "Synthetic output for the development refresh regression.");
  // A bounded idle interval is intentional: the original bug repeatedly reloaded
  // an untouched form (19 navigations in five seconds), erasing the typed values.
  await page.waitForTimeout(5000);

  await expect(page.getByLabel("Email *")).toHaveValue("fixture@example.com");
  await expect(page.getByLabel("Password *")).toHaveValue("dummy-password");
  expect(forcedReloads).toBe(reloadsBeforeObservation);
  await page
    .getByRole("form", { name: "Sign in" })
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL("/analysis-targets");
  await expect(page.getByRole("heading", { name: "A bakery" })).toBeVisible();
});
