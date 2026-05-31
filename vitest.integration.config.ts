import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "worker-integration",
    include: ["apps/worker/__tests__/integration/**/*.test.ts"],
    passWithNoTests: true,
    environment: "node",
  },
  resolve: {
    alias: [
      { find: /^@shared\/(.*)/, replacement: path.resolve(__dirname, "packages/shared/$1") },
      { find: /^@worker\/(.*)/, replacement: path.resolve(__dirname, "apps/worker/$1") },
      { find: /^@protocol\/(.*)/, replacement: path.resolve(__dirname, "packages/protocol/$1") },
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "src/client/$1") },
      // Integration tests run with drizzle-orm/postgres-js (Node.js compatible).
      // postgres-js installs transparent serializers for JSONB, so drizzle relies
      // on mapToDriverValue. The production bun-jsonb.ts has no toDriver (correct
      // for Bun SQL which handles object→JSONB natively). This alias substitutes a
      // postgres-js-compatible column that adds toDriver: JSON.stringify.
      {
        find: /^.*\/bun-jsonb$/,
        replacement: path.resolve(__dirname, "apps/worker/__tests__/helpers/test-jsonb.ts"),
      },
    ],
  },
});
