import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "worker-unit",
    include: [
      "apps/worker/__tests__/unit/**/*.test.ts",
      "apps/worker/lib/**/*.test.ts",
      "apps/worker/db/**/*.test.ts",
      "src/client/lib/**/*.test.ts",
      "deploy/docker/tests/**/*.test.ts",
    ],
    environment: "node",
    setupFiles: ["./vitest.unit.setup.ts"],
  },
  resolve: {
    alias: [
      { find: /^@shared\/(.*)/, replacement: path.resolve(__dirname, "packages/shared/$1") },
      { find: /^@worker\/(.*)/, replacement: path.resolve(__dirname, "apps/worker/$1") },
      { find: /^@protocol\/(.*)/, replacement: path.resolve(__dirname, "packages/protocol/$1") },
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, "src/client/$1") },
      // Map the Rust FFI module to a pure-TypeScript mock for the Node/Vitest environment.
      // The real ffi.ts uses bun:ffi to load a native .so — unavailable in unit tests.
      { find: "@llamenos/crypto/ffi", replacement: path.resolve(__dirname, "apps/worker/__tests__/mocks/llamenos-crypto-ffi.ts") },
    ],
  },
});
