import { defineConfig, devices } from "@playwright/test";
import { defineBddProject } from "playwright-bdd";

// ESM-safe worktree detection (no __dirname in ESM scope)
const configDir = new URL(".", import.meta.url).pathname;

// Desktop BDD: exclude tests/steps/backend/ to avoid loading backend-only step defs
// that use a different createBdd() instance.
const desktopStepDirs = [
  "admin", "auth", "calls", "cases", "common", "contacts", "conversations",
  "crypto", "dashboard", "help", "hub", "messaging", "notes", "reports",
  "security", "settings", "shifts",
];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
      workers: process.env.CI ? 4 : 3,
  reporter: process.env.CI
    ? [
        ["github"],
        ["json", { outputFile: "test-results/results.json" }],
        ["line"],
      ]
    : [["list"]],
  timeout: process.env.CI ? 60_000 : 30_000,
  globalSetup: './tests/global-setup.ts',
  expect: {
    timeout: process.env.CI ? 15_000 : 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8788",
    trace: "on-first-retry",
    actionTimeout: process.env.CI ? 15_000 : 10_000,
    navigationTimeout: process.env.CI ? 30_000 : 15_000,
  },
  projects: [
    {
      // Bootstrap tests delete the admin user (test-reset-no-admin) and must run
      // before all parallel tests to avoid corrupting shared DB state.
      // The last bootstrap test restores normal state via resetTestState().
      name: "bootstrap",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/bootstrap.spec.ts"],
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Exclude bootstrap tests and screenshots — bootstrap runs in its own project above,
      // screenshots are on-demand only (run via `bun run test:screenshots`).
      // Exclude traditional tests — they run in the "traditional" project below.
      testIgnore: ["**/live/**", "**/desktop/**", "**/integration/**", "**/bootstrap.spec.ts", "**/screenshots.spec.ts", "**/traditional/**"],
      // Wait for bootstrap tests to complete and restore admin before parallel tests run.
      dependencies: ["bootstrap"],
    },
    {
      name: "traditional",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/traditional/**/*.spec.ts"],
      // Wait for bootstrap tests to complete and restore admin before parallel tests run.
      dependencies: ["bootstrap"],
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
        tags: "@desktop and not @backend and not @wip and not @requires-camera and not @requires-live-calls and not @requires-demo",
        // Backend-only scenarios have steps not defined in desktop — skip them
        missingSteps: "skip-scenario",
      }),
      use: { ...devices["Desktop Chrome"] },
      fullyParallel: true,
      // Wait for bootstrap tests to complete and restore admin before BDD workers start.
      // workerHub fixture calls POST /api/hubs at worker startup — if bootstrap's
      // test-reset-no-admin runs concurrently, the admin user is missing and the call gets 401.
      dependencies: ["bootstrap"],
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
      fullyParallel: true,
  workers: process.env.CI ? 4 : 3,
      // Wait for bootstrap tests to finish before starting.
      // backend-bdd scenarios create a hub per-scenario via workerHub fixture —
      // if bootstrap's test-reset-no-admin runs concurrently, the admin is gone
      // and hub creation returns 401.
      dependencies: ["bootstrap"],
    },
    {
      // On-demand screenshot capture — NOT included in default CI runs.
      // Run via: bun run test:screenshots
      name: "screenshots",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
      testMatch: ["**/screenshots.spec.ts"],
      retries: 0,
      dependencies: ["bootstrap"],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Build once, then serve static files — far more stable than Vite dev server
        // under parallel test load (4 workers × 535 tests).
        // Uses `vite preview` which serves the production build without HMR.
        command:
          "PLAYWRIGHT_TEST=true bun run build && PLAYWRIGHT_TEST=true bunx vite preview --port 8788 --strictPort",
        url: "http://localhost:8788",
        // Never reuse a server from a different worktree or main checkout —
        // stale builds silently serve wrong code, causing hard-to-diagnose
        // test failures when testIds or API responses don't match the branch.
        reuseExistingServer: !process.env.CI && !configDir.includes("/.worktrees/"),
        timeout: 120_000, // Allow time for the build step
      },
});
