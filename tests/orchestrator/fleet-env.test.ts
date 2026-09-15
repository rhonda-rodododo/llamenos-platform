import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * `checkFleetEnvFile` reads `FLEET_ENV_FILE`, which (see paths.ts) resolves
 * under `fleetHome()` — so, like paths.test.ts, these tests point
 * `FLEET_HOME` at their own per-test temp dir and re-import both modules
 * fresh via `vi.resetModules()`, rather than relying on the single shared
 * `FLEET_HOME` the whole suite already runs under
 * (`vitest.orchestrator.config.ts`'s `test.env`) — that dir is shared across
 * every test file in the run, so writing a real `env` file into it here
 * would leak into whatever else runs in the same process.
 */
describe('checkFleetEnvFile — the three states doctor surfaces', () => {
  const originalFleetHome = process.env['FLEET_HOME']
  let tempHome: string | undefined

  afterEach(() => {
    if (originalFleetHome === undefined) delete process.env['FLEET_HOME']
    else process.env['FLEET_HOME'] = originalFleetHome
    vi.resetModules()
    if (tempHome !== undefined) {
      try { rmSync(tempHome, { recursive: true, force: true }) } catch { /* already gone */ }
      tempHome = undefined
    }
  })

  async function freshModules() {
    vi.resetModules()
    const paths = await import('../../orchestrator/src/paths.js')
    const fleetEnv = await import('../../orchestrator/src/fleet-env.js')
    return { paths, fleetEnv }
  }

  function freshTempHome(): string {
    const dir = mkdtempSync(join(tmpdir(), 'llamenos-fleet-env-test-'))
    tempHome = dir
    process.env['FLEET_HOME'] = dir
    return dir
  }

  it('absent — reports "absent" with the operator-account warning, never a failure', async () => {
    freshTempHome()
    const { fleetEnv } = await freshModules()
    const result = fleetEnv.checkFleetEnvFile()
    expect(result.state).toBe('absent')
    expect(result.message).toBe(fleetEnv.ABSENT_MESSAGE)
    expect(result.message).toMatch(/operator's account/)
    expect(result.message).toMatch(/GH_TOKEN/)
  })

  it('present with the wrong mode (0644) — reports "fail" even though GH_TOKEN is defined', async () => {
    freshTempHome()
    const { paths, fleetEnv } = await freshModules()
    mkdirSync(dirname(paths.FLEET_ENV_FILE), { recursive: true })
    writeFileSync(paths.FLEET_ENV_FILE, 'GH_TOKEN=ghp_test_token\n')
    chmodSync(paths.FLEET_ENV_FILE, 0o644)
    const result = fleetEnv.checkFleetEnvFile()
    expect(result.state).toBe('fail')
    expect(result.message).toMatch(/0600/)
  })

  it('present, mode 0600, GH_TOKEN defined — reports "ok"', async () => {
    freshTempHome()
    const { paths, fleetEnv } = await freshModules()
    mkdirSync(dirname(paths.FLEET_ENV_FILE), { recursive: true })
    writeFileSync(paths.FLEET_ENV_FILE, 'GH_TOKEN=ghp_test_token\n')
    chmodSync(paths.FLEET_ENV_FILE, 0o600)
    const result = fleetEnv.checkFleetEnvFile()
    expect(result.state).toBe('ok')
    expect(result.message).toBe(paths.FLEET_ENV_FILE)
  })

  // MUTATION GUARD: a version that only checked mode and never inspected
  // content would pass the 0644 test above (wrong mode is caught either way)
  // but would wrongly report "ok" here — a 0600 file that defines nothing
  // useful must still fail, since it looks configured while doing nothing.
  it('present, mode 0600, but GH_TOKEN missing — still reports "fail"', async () => {
    freshTempHome()
    const { paths, fleetEnv } = await freshModules()
    mkdirSync(dirname(paths.FLEET_ENV_FILE), { recursive: true })
    writeFileSync(paths.FLEET_ENV_FILE, 'SOME_OTHER_VAR=1\n')
    chmodSync(paths.FLEET_ENV_FILE, 0o600)
    const result = fleetEnv.checkFleetEnvFile()
    expect(result.state).toBe('fail')
    expect(result.message).toMatch(/GH_TOKEN/)
  })

  // Non-self-referential: writes to a path built independently of
  // `paths.FLEET_ENV_FILE` — literally `join(FLEET_HOME, '.llamenos-fleet',
  // 'env')`, the same path the wrapper and systemd units hardcode via
  // `$HOME`/`%h` — rather than asking `paths.FLEET_ENV_FILE` where to write
  // and then asking it again whether the file is there. A regression back to
  // `FLEET_ENV_FILE = join(fleetHome(), 'env')` would write/stat a
  // DIFFERENT file (`<tempHome>/env`) than the one this test creates
  // (`<tempHome>/.llamenos-fleet/env`), so `checkFleetEnvFile` would report
  // 'absent' here even though a validly-configured file exists on disk —
  // that mismatch is exactly the bug this PR fixes.
  it('doctor finds a real GH_TOKEN file at the independently-computed .llamenos-fleet/env path', async () => {
    const dir = freshTempHome()
    const { fleetEnv } = await freshModules()
    const independentPath = join(dir, '.llamenos-fleet', 'env')
    mkdirSync(join(dir, '.llamenos-fleet'), { recursive: true })
    writeFileSync(independentPath, 'GH_TOKEN=ghp_test_token\n')
    chmodSync(independentPath, 0o600)
    const result = fleetEnv.checkFleetEnvFile()
    expect(result.state).toBe('ok')
    expect(result.message).toBe(independentPath)
  })
})

describe('orchestrator/bin/llamenos-fleet wrapper sources the fleet env file', () => {
  // No shell test harness exists for this wrapper (it is a plain bash script,
  // not something the vitest suite executes), so per the task this asserts
  // the exact sourcing line is present — the same line the two systemd units
  // carry via `EnvironmentFile=-%h/.llamenos-fleet/env`, so a dispatched
  // worker or a hand-run `llamenos-fleet` command inherits `GH_TOKEN` too.
  it('contains the exact `[ -f ... ] && set -a && . ... && set +a` sourcing line', () => {
    const wrapperPath = join(import.meta.dirname, '..', '..', 'orchestrator', 'bin', 'llamenos-fleet')
    const content = readFileSync(wrapperPath, 'utf8')
    expect(content).toContain('[ -f "$HOME/.llamenos-fleet/env" ] && set -a && . "$HOME/.llamenos-fleet/env" && set +a')
  })
})
