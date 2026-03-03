import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "worker-unit",
    include: ["src/worker/__tests__/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@shared\/(.*)/, replacement: path.resolve(__dirname, "src/shared/$1") },
      { find: /^@worker\/(.*)/, replacement: path.resolve(__dirname, "src/worker/$1") },
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "src/client/$1") },
    ],
  },
});
