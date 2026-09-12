import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * This box runs both this test suite and a real fleet. `orchestrator/src/
 * paths.ts` resolves every fleet state path (the halt file included) through
 * a single `FLEET_HOME` override, and `test.env` is the officially supported
 * way to inject an env var into every test context regardless of pool type
 * (threads or forks) — unlike mutating `process.env` here directly, which
 * only reaches worker processes that happen to inherit this main process's
 * environment at spawn time. Computed once, synchronously, before any test
 * file loads: by the time `paths.ts` is first imported by any test, this
 * value is already set, so nothing the suite does — including the
 * breaker-halt tests, which write a real halt file by design — can reach
 * `$HOME/.llamenos-fleet-disabled` or `$HOME/.llamenos-fleet/`.
 *
 * Left on disk after the run rather than torn down with a global teardown:
 * it is an empty-or-small, gitignored temp directory, a fresh one is made on
 * every run, and the OS reclaims `TMPDIR` on its own schedule — the failure
 * mode this exists to prevent is state leaking OUT to the real fleet, not a
 * few stray bytes left IN `/tmp`.
 */
const testFleetHome = mkdtempSync(join(tmpdir(), 'llamenos-fleet-test-home-'))

export default defineConfig({
  test: {
    name: 'fleet',
    include: ['tests/orchestrator/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    env: { FLEET_HOME: testFleetHome },
  },
})
