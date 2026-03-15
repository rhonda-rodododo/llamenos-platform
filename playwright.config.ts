import { defineConfig, devices } from "@playwright/test";
import { defineBddProject } from "playwright-bdd";

// Desktop BDD: exclude tests/steps/backend/ to avoid loading backend-only step defs
// that use a different createBdd() instance.
const desktopStepDirs = [
  "admin", "auth", "calls", "cases", "common", "contacts", "conversations",
  "crypto", "dashboard", "help", "messaging", "notes", "reports",
  "security", "settings", "shifts",
];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 3,
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
      testDir: "./tests",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/bootstrap\.spec\.ts/, "**/live/**", "**/desktop/**", "**/integration/**"],
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
    {
      ...defineBddProject({
        name: "bdd",
        features: "packages/test-specs/features/**/*.feature",
        steps: [
          "tests/steps/*.ts",
          ...desktopStepDirs.map((d) => `tests/steps/${d}/**/*.ts`),
        ],
        featuresRoot: "packages/test-specs/features",
        tags: "@desktop and not @backend and not @wip and not @resets-state",
        // Backend-only scenarios have steps not defined in desktop — skip them
        missingSteps: "skip-scenario",
      }),
      use: { ...devices["Desktop Chrome"] },
      fullyParallel: true,
      dependencies: ["setup"],
    },
    {
      // @resets-state tests modify shared server state (toggle CMS, apply templates,
      // create/archive entity types) — must run serially to avoid parallel conflicts.
      ...defineBddProject({
        name: "bdd-serial",
        features: "packages/test-specs/features/**/*.feature",
        steps: [
          "tests/steps/*.ts",
          ...desktopStepDirs.map((d) => `tests/steps/${d}/**/*.ts`),
        ],
        featuresRoot: "packages/test-specs/features",
        tags: "@desktop and @resets-state and not @backend and not @wip",
        missingSteps: "skip-scenario",
      }),
      use: { ...devices["Desktop Chrome"] },
      fullyParallel: false,
      dependencies: ["setup"],
    },
    {
      ...defineBddProject({
        name: "backend-bdd",
        features: "packages/test-specs/features/**/*.feature",
        steps: "tests/steps/backend/**/*.ts",
        featuresRoot: "packages/test-specs/features",
        tags: "@backend",
        // Desktop/mobile-only scenarios have steps not defined in backend — skip them
        missingSteps: "skip-scenario",
      }),
      use: {
        baseURL: process.env.TEST_HUB_URL || "http://localhost:3000",
      },
      // Backend tests share server state (test-reset between scenarios) — must run serially
      fullyParallel: false,
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Build once, then serve static files — far more stable than Vite dev server
        // under parallel test load (3 workers × 535 tests).
        // Uses `vite preview` which serves the production build without HMR.
        command:
          "PLAYWRIGHT_TEST=true bun run build && PLAYWRIGHT_TEST=true bunx vite preview --port 8788 --strictPort",
        url: "http://localhost:8788",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000, // Allow time for the build step
      },
});
