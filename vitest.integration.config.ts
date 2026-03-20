import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "worker-integration",
    include: ["apps/worker/__tests__/integration/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@shared\/(.*)/, replacement: path.resolve(__dirname, "packages/shared/$1") },
      { find: /^@worker\/(.*)/, replacement: path.resolve(__dirname, "apps/worker/$1") },
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "src/client/$1") },
    ],
  },
});
