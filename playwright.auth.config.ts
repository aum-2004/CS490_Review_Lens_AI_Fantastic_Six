import { defineConfig, devices } from "@playwright/test";

// Deterministic integration test: the real app + SDK talk only to a local fixture.
const appCommand =
  process.env.PLAYWRIGHT_AUTH_SERVER === "production"
    ? "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100"
    : "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100";

export default defineConfig({
  testDir: "./tests/e2e/auth",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: [
    {
      command: "node tests/fixtures/auth-provider.mjs",
      url: "http://127.0.0.1:54329/ready",
      reuseExistingServer: false,
    },
    {
      command: appCommand,
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-publishable-key",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
