import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "worker-unit",
    include: ["apps/worker/__tests__/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@shared\/(.*)/, replacement: path.resolve(__dirname, "packages/shared/$1") },
      { find: /^@worker\/(.*)/, replacement: path.resolve(__dirname, "apps/worker/$1") },
      { find: /^@protocol\/(.*)/, replacement: path.resolve(__dirname, "packages/protocol/$1") },
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "src/client/$1") },
    ],
  },
});
