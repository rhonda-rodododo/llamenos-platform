import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * J1 fix: this box runs both this test suite and a real fleet, and
 * `orchestrator/src/paths.ts` resolves every fleet state path — including
 * the halt file — through a single `FLEET_HOME` override so the suite can
 * never write to the real `$HOME`'s fleet state. This file asserts that the
 * override actually reaches every exported path, not just the ones a human
 * remembered to check by hand.
 *
 * These tests set `process.env['FLEET_HOME']` themselves and re-import via
 * `vi.resetModules()` + dynamic `import()` — the whole suite already runs
 * with `FLEET_HOME` pinned to one temp dir by `vitest.orchestrator.config.ts`
 * (`test.env`), so proving the override actually moves things requires
 * pointing it at a SECOND, different temp dir here and re-evaluating the
 * module fresh.
 */
describe('FLEET_HOME — single resolution point for fleet state paths', () => {
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

  it('every fleet-state path exported by paths.ts resolves under FLEET_HOME when it is set', async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'llamenos-fleet-paths-test-'))
    process.env['FLEET_HOME'] = tempHome
    vi.resetModules()
    const paths = await import('../../orchestrator/src/paths.js')

    // Iterate the module's own exports rather than listing constants by
    // hand: a state path added to paths.ts later is covered automatically,
    // which is the actual gap this test exists to close — an override that
    // some paths honour and others don't is worse than no override, because
    // it LOOKS isolated while leaking.
    const stringExports = Object.entries(paths).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    )
    expect(stringExports.length).toBeGreaterThan(0)

    // DISPATCH_SKILL_DIR / DISPATCH_SCRIPT are a real, pinned dependency
    // location outside this repo's own runtime state (see the comment on
    // DISPATCH_SKILL_DIR in paths.ts) — they are deliberately NOT fleet
    // state and must NOT move with FLEET_HOME, so they are excluded here by
    // name rather than silently passing (or silently failing) the loop.
    const notFleetState = new Set(['DISPATCH_SKILL_DIR', 'DISPATCH_SCRIPT'])
    const fleetStatePaths = stringExports.filter(([name]) => !notFleetState.has(name))
    expect(fleetStatePaths.length).toBeGreaterThan(0)

    for (const [name, value] of fleetStatePaths) {
      expect(value.startsWith(tempHome), `${name} = ${JSON.stringify(value)} did not resolve under FLEET_HOME (${tempHome})`).toBe(true)
    }
  })

  it('LANE_MODES_FILE (config.ts) also resolves under FLEET_HOME, via FLEET_DIR', async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'llamenos-fleet-paths-test-'))
    process.env['FLEET_HOME'] = tempHome
    vi.resetModules()
    const { LANE_MODES_FILE } = await import('../../orchestrator/src/config.js')
    expect(LANE_MODES_FILE.startsWith(tempHome)).toBe(true)
  })

  it('falls back to the real homedir() when FLEET_HOME is unset, preserving production behaviour', async () => {
    delete process.env['FLEET_HOME']
    vi.resetModules()
    const paths = await import('../../orchestrator/src/paths.js')
    expect(paths.FLEET_DIR.startsWith(homedir())).toBe(true)
    expect(paths.HALT_FILE.startsWith(homedir())).toBe(true)
  })

  // MUTATION GUARD: a version of fleetHome() that only some exports called
  // (e.g. FLEET_DIR derived from it but HALT_FILE hardcoded to homedir()
  // directly, as it was before this fix) would still pass a test that only
  // checked FLEET_DIR. This asserts the specific path the incident in J1
  // was about.
  it('HALT_FILE specifically — the path a leftover write would silently stop a live fleet through — resolves under FLEET_HOME', async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'llamenos-fleet-paths-test-'))
    process.env['FLEET_HOME'] = tempHome
    vi.resetModules()
    const { HALT_FILE } = await import('../../orchestrator/src/paths.js')
    expect(HALT_FILE.startsWith(tempHome)).toBe(true)
    expect(HALT_FILE).not.toBe(join(homedir(), '.llamenos-fleet-disabled'))
  })
})
