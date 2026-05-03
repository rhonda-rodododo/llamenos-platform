import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "signal-notifier",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
