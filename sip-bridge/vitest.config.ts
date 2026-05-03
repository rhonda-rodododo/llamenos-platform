import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sip-bridge",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
