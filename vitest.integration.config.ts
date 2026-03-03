import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    name: "worker-integration",
    include: ["apps/worker/__tests__/integration/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./apps/worker/wrangler.jsonc" },
      },
    },
  },
});
