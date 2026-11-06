import { expect, test } from "@playwright/test";

test("establishes, refreshes, preserves, and clears SDK cookie sessions", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/login");
  const form = page.getByRole("form", { name: "Sign in" });
  await expect(form).toBeVisible();
  await page.getByLabel("Email *").fill("fixture@example.com");
  await page.getByLabel("Password *").fill("incorrect-password");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("We couldn't sign you in");
  await expect(page.getByLabel("Email *")).toHaveValue("fixture@example.com");

  await page.getByLabel("Password *").fill("dummy-password");
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("fixture@example.com");

  // Use only dummy fixture data to expire cookie storage deterministically.
  // Normal login tokens retain Supabase's recommended lifetime rather than
  // expiring during the Server Action's own render.
  const authCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.includes("auth-token"),
  );
  expect(authCookies).toHaveLength(1);
  const expiredSession = await (await request.get("http://127.0.0.1:54329/expired-session")).json();
  await context.addCookies([
    {
      ...authCookies[0],
      value: `base64-${Buffer.from(JSON.stringify(expiredSession)).toString("base64url")}`,
    },
  ]);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("fixture@example.com");
  await expect
    .poll(async () => (await (await request.get("http://127.0.0.1:54329/stats")).json()).refreshed)
    .toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole("status")).toContainText("fixture@example.com");
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/analysis-targets");
  await page.goto("/login");
  await expect(page.getByRole("status")).toContainText("fixture@example.com");
  const identity = await context.request.get("/api/auth/session");
  expect(identity.status()).toBe(200);
  expect((await identity.json()).data.user.id).toBe("00000000-0000-4000-8000-000000000009");

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  expect((await context.request.get("/api/auth/session")).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole("form", { name: "Sign in" })).toBeVisible();
  await page.goBack();
  await expect(page.getByText(/You’re signed in/)).toHaveCount(0);
});

test("registration reports confirmation rather than creating an authenticated session", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page
    .getByRole("group", { name: "Account access" })
    .getByRole("button", { name: "Register" })
    .click();
  await page.getByLabel("Email *").fill("new-fixture@example.com");
  await page.getByLabel("Password *").fill("dummy-new-password");
  await page
    .getByRole("form", { name: "Register" })
    .getByRole("button", { name: "Register", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  expect((await context.request.get("/api/auth/session")).status()).toBe(401);
});
