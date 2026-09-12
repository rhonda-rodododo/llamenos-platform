import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'fleet',
    include: ['tests/orchestrator/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
