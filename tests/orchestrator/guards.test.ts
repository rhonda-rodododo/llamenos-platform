import { describe, it, expect, afterEach } from 'vitest'
import { LANES, NEVER_WRITE_PATHS, loadLanes, readLaneModes, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import { classifyImpact } from '../../orchestrator/src/impact.js'
import { checkScope } from '../../orchestrator/src/scope.js'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('rail: a live lane must have a write scope', () => {
  // Asserted against a synthetic lane, not the live config: every configured
  // lane defaults to `off`, so looping over them would execute no assertion at
  // all — a test that passes by never running its check.
  it('throws rather than running a live lane with an empty scope', () => {
    expect(() => assertLiveLanesHaveScope([{
      id: 'ios', mode: 'live', cap: 1, engine: 'claude',
      requireLabel: 'agent-dispatchable', vetoLabels: [],
      scope: { owned: [], notOwned: [] },
    }])).toThrow()
  })

  it('parses a non-empty scope for every configured lane', async () => {
    // Point lane modes at a fixture that cannot exist, rather than the real
    // ~/.llamenos-fleet/lanes.json: this test asserts fragment PARSING, not
    // anything about live/shadow state, and reading the operator's actual
    // runtime state would make the test's outcome depend on whatever that
    // machine happens to have turned on (e.g. assertLiveLanesHaveScope
    // throwing for a real live lane, for reasons unrelated to what this test
    // checks).
    const lanes = await loadLanes(process.cwd(), '/nonexistent/fixture-lanes.json')
    for (const l of lanes) {
      expect(l.scope.owned.length, `lane ${l.id} parsed no owned paths from its fragment`).toBeGreaterThan(0)
    }
  })
})

describe('rail: the fleet cannot merge its own changes', () => {
  it('classifies orchestrator source as high impact', () => {
    expect(classifyImpact(['orchestrator/src/tick.ts'], 1).impact).toBe('high')
  })
  it('classifies its own tests as high impact', () => {
    expect(classifyImpact(['tests/orchestrator/guards.test.ts'], 1).impact).toBe('high')
  })
})

describe('rail: crypto and protocol always reach a human', () => {
  it.each([
    'packages/crypto/src/hpke.rs',
    'packages/protocol/schemas/note.ts',
    'packages/protocol/crypto-labels.json',
    'apps/worker/lib/auth.ts',
    // The key-boundary wrapper: not the crypto crate itself, but the single
    // abstraction (per CLAUDE.md) keeping a device private key out of the
    // webview. A quiet mistake here is an identity disclosure exactly like a
    // mistake in packages/crypto/ itself — see impact.ts's CORRECTED comment
    // for why this was briefly (and wrongly) narrowed out, then restored.
    'src/client/lib/platform.ts',
  ])('%s is high impact', (f) => {
    expect(classifyImpact([f], 1).impact).toBe('high')
  })
})

describe('rail: never-write binds even an unrestricted lane', () => {
  it('forbids secrets for a lane with no declared scope', () => {
    expect(checkScope(['.env'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden).toEqual(['.env'])
  })

  it('forbids a nested secrets file for a lane with no declared scope', () => {
    expect(checkScope(['apps/worker/config/.env'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual(['apps/worker/config/.env'])
  })

  it('forbids a signing keystore for a lane with no declared scope', () => {
    expect(checkScope(['apps/android/keystore.properties'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual(['apps/android/keystore.properties'])
  })

  // NARROWED 2026-09-12 (impact.ts's dated comment): with no production
  // users yet, CI and deploy are writable AND low-impact — the deterministic
  // gates (scope, diff-targeted tests, non-author review, verified-SHA pin)
  // are the decision, not a human. Must flip back to high-impact once the
  // first internal testers are onboarded.
  it('leaves CI and deploy writable and low-impact — the deterministic gates decide, not a human', () => {
    expect(checkScope(['.github/workflows/ci.yml'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual([])
    expect(classifyImpact(['.github/workflows/ci.yml'], 1).impact).toBe('low')
    expect(classifyImpact(['deploy/helm/values.yaml'], 1).impact).toBe('low')
  })
})

describe('rail: the GitHub kill switch fails open', () => {
  it('does not halt when the issue list could not be read', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})

// The single-origin-remote invariant ("rail: origin points at
// llamenos-platform") used to be asserted here by shelling out to
// `git remote -v` on the machine running the test suite. Removed: it
// asserted the test-runner's own git config, not the code — it fails on any
// contributor's fork or differently-configured checkout for reasons that
// have nothing to do with the diff under test, and `doctor`
// (orchestrator/src/cli.ts) already enforces the stronger form of this
// invariant (exactly one remote, named origin) at runtime on the only
// machine where the answer is meaningful: the operator's.

describe('rail: every lane starts off', () => {
  it('ships no lane in live or shadow mode by default', () => {
    expect(LANES.filter((l) => l.mode !== 'off')).toHaveLength(0)
  })
})

describe('rail: lane modes are runtime state, not source', () => {
  // orchestrator/ is high-impact and human-gated. If a lane's mode lived in
  // config.ts, flipping it from off to shadow would need a reviewed PR —
  // defeating the point of a runtime dial. Proven behaviorally: write a real
  // modes file and show readLaneModes()/loadLanes() actually pick the mode
  // up from its content, rather than grepping config.ts's source text for a
  // constant name (a check a refactor could break, or a hardcoded mode could
  // satisfy, without the underlying property changing either way).
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  function tempModesFile(modes: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-guards-lane-modes-'))
    dirs.push(dir)
    const file = join(dir, 'lanes.json')
    writeFileSync(file, JSON.stringify(modes))
    return file
  }

  it('readLaneModes reads a lane mode from file content, not from source', () => {
    const file = tempModesFile({ backend: 'shadow' })
    expect(readLaneModes(file)).toEqual({ backend: 'shadow' })
  })

  it('loadLanes turns a lane on from the modes file alone, with no source change', async () => {
    const file = tempModesFile({ ios: 'live' })
    const lanes = await loadLanes(process.cwd(), file)
    expect(lanes.find((l) => l.id === 'ios')?.mode).toBe('live')
    // Every other lane is untouched by that same file.
    expect(lanes.filter((l) => l.id !== 'ios').every((l) => l.mode === 'off')).toBe(true)
  })
})
