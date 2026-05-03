import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "signal-notifier",
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
