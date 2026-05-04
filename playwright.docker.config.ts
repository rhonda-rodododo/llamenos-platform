/**
 * Playwright configuration for running E2E tests against the Docker Compose stack.
 *
 * This targets the Node.js server directly at http://localhost:3000,
 * bypassing the Vite dev server. Used for validating Node.js platform parity.
 *
 * Prerequisites:
 *   bun run test:docker:up   # Start Docker Compose with test overrides
 *   bunx playwright test --config playwright.docker.config.ts
 *   bun run test:docker:down # Tear down after tests
 */
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const bddTestDir = defineBddConfig({
  features: "packages/test-specs/features/**/*.feature",
  steps: "tests/steps/**/*.ts",
  outputDir: ".features-gen",
  featuresRoot: "packages/test-specs/features",
  tags: "@desktop and not @backend",
});

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/live/**", "**/desktop/**", "**/integration/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 3,
  reporter: process.env.CI
    ? [
        ["github"],
        ["json", { outputFile: "test-results/results.json" }],
        ["line"],
      ]
    : [["list"]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    // Target the Docker Compose Node.js server directly
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
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
      testIgnore: /bootstrap\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "bootstrap",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /bootstrap\.spec\.ts/,
      dependencies: ["chromium"],
    },
    {
      name: "bdd",
      testDir: bddTestDir,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  // No webServer — expects Docker Compose to already be running
});
