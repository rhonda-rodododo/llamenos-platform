import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/live/**", "**/desktop/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 1,
  reporter: "html",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8788",
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Exclude bootstrap tests — they delete admin state and interfere with parallel tests
      testIgnore: /bootstrap\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      // Bootstrap tests run after main tests to avoid admin-deletion race conditions
      name: "bootstrap",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /bootstrap\.spec\.ts/,
      dependencies: ["chromium"],
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "PLAYWRIGHT_TEST=true bun run build && bunx wrangler dev --port 8788",
        url: "http://localhost:8788",
        reuseExistingServer: !process.env.CI,
      },
});
