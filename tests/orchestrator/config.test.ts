import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  LANES, LIMITS, NEVER_WRITE_PATHS, MAX_ATTEMPTS_PER_ITEM,
  assertLiveLanesHaveScope, readLaneModes,
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

describe('readLaneModes', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  function modesFile(content: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-lane-modes-'))
    dirs.push(dir)
    const file = join(dir, 'lanes.json')
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
    return file
  }

  it('parses the legacy bare-mode-string shape', () => {
    expect(readLaneModes(modesFile({ backend: 'live', ios: 'off' })))
      .toEqual({ backend: { mode: 'live' }, ios: { mode: 'off' } })
  })

  it('parses the object shape with engine and model', () => {
    const file = modesFile({ backend: { mode: 'live', engine: 'opencode', model: 'kimi-for-coding/k3-256k' } })
    expect(readLaneModes(file)).toEqual({
      backend: { mode: 'live', engine: 'opencode', model: 'kimi-for-coding/k3-256k' },
    })
  })

  it('accepts both shapes in the same file', () => {
    const file = modesFile({ backend: 'live', ios: { mode: 'shadow', engine: 'opencode' } })
    expect(readLaneModes(file)).toEqual({
      backend: { mode: 'live' },
      ios: { mode: 'shadow', engine: 'opencode' },
    })
  })

  it('rejects an invalid engine: lane stays off and the reason is reported', () => {
    const onReject = vi.fn()
    const file = modesFile({ backend: { mode: 'live', engine: 'gpt' } })
    expect(readLaneModes(file, onReject)).toEqual({})
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0]?.[0]).toBe('backend')
    expect(onReject.mock.calls[0]?.[1]).toMatch(/invalid engine/i)
  })

  it('rejects an invalid mode: lane stays off and the reason is reported', () => {
    const onReject = vi.fn()
    const file = modesFile({ backend: { mode: 'turbo' }, ios: 'shadow' })
    expect(readLaneModes(file, onReject)).toEqual({ ios: { mode: 'shadow' } })
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0]?.[1]).toMatch(/invalid mode/i)
  })

  it('rejects unknown keys in the object shape', () => {
    const onReject = vi.fn()
    const file = modesFile({ backend: { mode: 'live', engine: 'opencode', model: 'kimi', cap: 5 } })
    expect(readLaneModes(file, onReject)).toEqual({})
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0]?.[1]).toMatch(/unknown override key/i)
    expect(onReject.mock.calls[0]?.[1]).toContain('cap')
  })

  it('rejects a non-string model', () => {
    const onReject = vi.fn()
    const file = modesFile({ backend: { mode: 'live', engine: 'opencode', model: 42 } })
    expect(readLaneModes(file, onReject)).toEqual({})
    expect(onReject.mock.calls[0]?.[1]).toMatch(/invalid model/i)
  })

  it('rejects unrecognized entry shapes (numbers, arrays, null)', () => {
    const onReject = vi.fn()
    const file = modesFile({ backend: 1, ios: ['live'], android: null })
    expect(readLaneModes(file, onReject)).toEqual({})
    expect(onReject).toHaveBeenCalledTimes(3)
  })

  it('never throws on malformed JSON — every lane stays off', () => {
    const onReject = vi.fn()
    expect(readLaneModes(modesFile('{not json'), onReject)).toEqual({})
  })

  it('never throws on a missing file — every lane stays off', () => {
    expect(readLaneModes(join(tmpdir(), 'definitely-not-here-lanes.json'))).toEqual({})
  })
})
