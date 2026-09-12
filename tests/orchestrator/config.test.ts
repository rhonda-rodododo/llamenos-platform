import { describe, it, expect } from 'vitest'
import {
  LANES, LIMITS, NEVER_WRITE_PATHS, MAX_ATTEMPTS_PER_ITEM,
  assertLiveLanesHaveScope,
} from '../../orchestrator/src/config.js'
import type { Lane } from '../../orchestrator/src/config.js'
import { checkScope } from '../../orchestrator/src/scope.js'

describe('assertLiveLanesHaveScope', () => {
  const lane = (mode: Lane['mode'], owned: string[]): Lane => ({
    id: 'ios', mode, cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned, notOwned: [] },
  })

  it('throws when a live lane has no owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('live', [])])).toThrow(/no owned paths|write scope/i)
  })

  it('throws when a shadow lane has no owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('shadow', [])])).toThrow()
  })

  it('permits an off lane with no owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('off', [])])).not.toThrow()
  })

  it('permits a live lane with owned paths', () => {
    expect(() => assertLiveLanesHaveScope([lane('live', ['apps/ios/'])])).not.toThrow()
  })

  it('names the offending lane and its fragment in the error', () => {
    expect(() => assertLiveLanesHaveScope([lane('live', [])]))
      .toThrow(/ios-supervisor\.md/)
  })
})

describe('config', () => {
  it('defines exactly the six domain lanes', () => {
    expect(LANES.map((l) => l.id).sort())
      .toEqual(['android', 'backend', 'desktop', 'infra', 'ios', 'shared'])
  })

  it('defaults every lane to off', () => {
    expect(LANES.every((l) => l.mode === 'off')).toBe(true)
  })

  it('caps every lane at 1', () => {
    expect(LANES.every((l) => l.cap === 1)).toBe(true)
  })

  it('requires a dispatch label on every lane', () => {
    expect(LANES.every((l) => l.requireLabel.length > 0)).toBe(true)
  })

  it('vetoes on needs-human everywhere', () => {
    expect(LANES.every((l) => l.vetoLabels.includes('needs-human'))).toBe(true)
  })

  // `deploy/` and `.github/workflows/` were removed from the never-write list
  // (they now rely on the impact gate instead — see config.ts's comment on
  // NEVER_WRITE_PATHS), so this asserts what actually remains: secrets and
  // key material a worker must never write at all, anywhere in the tree.
  it('never permits writes to secrets or key material', () => {
    for (const p of ['.env', '.dev.vars', 'keystore.properties', '*.pem', 'id_rsa', 'id_ed25519']) {
      expect(NEVER_WRITE_PATHS).toContain(p)
    }
  })

  it('no longer blocks deploy/ or .github/workflows/ by never-write — those rely on the impact gate', () => {
    expect(NEVER_WRITE_PATHS).not.toContain('deploy/')
    expect(NEVER_WRITE_PATHS).not.toContain('.github/workflows/')
  })

  it('marks a nested .env as forbidden via the real NEVER_WRITE_PATHS basename match', () => {
    const r = checkScope(['apps/worker/config/.env'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS])
    expect(r.forbidden).toEqual(['apps/worker/config/.env'])
  })

  it('marks a nested keystore.properties as forbidden via the real NEVER_WRITE_PATHS basename match', () => {
    const r = checkScope(['apps/android/keystore.properties'], { owned: [], notOwned: [] }, [...NEVER_WRITE_PATHS])
    expect(r.forbidden).toEqual(['apps/android/keystore.properties'])
  })

  // F3: keystore.properties only holds the signing key's password — the key
  // itself (a .jks/.keystore file, or an iOS App Store Connect API key) was
  // previously writable by any lane.
  it('never permits writes to the actual signing keys, not just their passwords', () => {
    for (const p of [
      '*.jks', '*.keystore', '*.p8', '*.p12', '*.pfx', '*.key',
      '*.mobileprovision', '.npmrc', '.pgpass', 'authorized_keys',
    ]) {
      expect(NEVER_WRITE_PATHS).toContain(p)
    }
  })

  it('marks a release Android keystore and an iOS App Store Connect API key as forbidden', () => {
    const r = checkScope(
      ['apps/android/app/release.jks', 'apps/ios/fastlane/AuthKey_ABC123.p8'],
      { owned: [], notOwned: [] },
      [...NEVER_WRITE_PATHS],
    )
    expect(r.forbidden).toEqual(['apps/android/app/release.jks', 'apps/ios/fastlane/AuthKey_ABC123.p8'])
  })

  it('gives up on an item after three failed attempts', () => {
    expect(MAX_ATTEMPTS_PER_ITEM).toBe(3)
  })

  it('sets a conservative first-night dispatch ceiling', () => {
    expect(LIMITS.maxDispatchesPerHour).toBeLessThanOrEqual(12)
  })
})
