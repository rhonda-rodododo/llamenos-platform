import { describe, it, expect } from 'vitest'
import { LANES, NEVER_WRITE_PATHS, loadLanes, assertLiveLanesHaveScope } from '../../orchestrator/src/config.js'
import { classifyImpact } from '../../orchestrator/src/impact.js'
import { checkScope } from '../../orchestrator/src/scope.js'
import { haltedOnGitHubFrom } from '../../orchestrator/src/killswitch.js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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
    const lanes = await loadLanes(process.cwd())
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
    'apps/worker/db/migrations/0001_init.sql',
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

  it('leaves CI and deploy writable but high-impact, so the merge gate holds them', () => {
    expect(checkScope(['.github/workflows/ci.yml'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS]).forbidden)
      .toEqual([])
    expect(classifyImpact(['.github/workflows/ci.yml'], 1).impact).toBe('high')
    expect(classifyImpact(['deploy/helm/values.yaml'], 1).impact).toBe('high')
  })
})

describe('rail: the GitHub kill switch fails open', () => {
  it('does not halt when the issue list could not be read', () => {
    expect(haltedOnGitHubFrom(undefined)).toBe(false)
  })
})

describe('rail: exactly one git remote', () => {
  it('has only origin, pointing at llamenos-platform', () => {
    const remotes = execSync('git remote -v', { encoding: 'utf8' }).trim().split('\n')
    const names = new Set(remotes.map((l) => l.split(/\s+/)[0]))
    expect([...names]).toEqual(['origin'])
    expect(remotes.join(' ')).toContain('llamenos-platform')
  })
})

describe('rail: every lane starts off', () => {
  it('ships no lane in live or shadow mode by default', () => {
    expect(LANES.filter((l) => l.mode !== 'off')).toHaveLength(0)
  })
})

describe('rail: lane modes are runtime state, not source', () => {
  it('does not require editing orchestrator source to turn a dial', () => {
    // orchestrator/ is high-impact and human-gated. If mode lived in
    // config.ts, changing a lane from off to shadow would need a reviewed PR.
    const src = readFileSync('orchestrator/src/config.ts', 'utf8')
    expect(src).toContain('LANE_MODES_FILE')
  })
})
