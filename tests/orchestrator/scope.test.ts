import { describe, it, expect, beforeAll } from 'vitest'
import { checkScope } from '../../orchestrator/src/scope.js'
import { loadLaneScopes, type LaneScope } from '../../orchestrator/src/fragments.js'

const IOS: LaneScope = { owned: ['apps/ios/', '.github/workflows/ios*.yml'], notOwned: [] }
const NEVER = ['.env', 'deploy/', '.github/workflows/']

describe('checkScope', () => {
  it('passes a diff entirely inside the lane', () => {
    expect(checkScope(['apps/ios/Sources/App.swift'], IOS, [])).toEqual({ forbidden: [], strayed: [] })
  })

  it('flags a file outside the lane as strayed', () => {
    expect(checkScope(['apps/android/x.kt'], IOS, []).strayed).toEqual(['apps/android/x.kt'])
  })

  it('flags a never-write path as forbidden even when the lane owns it (via a glob match)', () => {
    const r = checkScope(['.github/workflows/ios-e2e.yml'], IOS, NEVER)
    expect(r.forbidden).toEqual(['.github/workflows/ios-e2e.yml'])
    expect(r.strayed).toEqual([])
  })

  it('enforces never-write even for an unrestricted lane', () => {
    const r = checkScope(['.env'], { owned: [], notOwned: [] }, NEVER)
    expect(r.forbidden).toEqual(['.env'])
  })

  it('reports every offending file, not just the first', () => {
    const r = checkScope(['apps/android/a.kt', 'src/client/b.ts'], IOS, [])
    expect(r.strayed).toHaveLength(2)
  })

  // --- Ruling 1: matchesPath (globs), not startsWith ---

  it('ios owns a glob workflow file (matchesPath, not startsWith)', () => {
    expect(checkScope(['.github/workflows/ios-e2e.yml'], IOS, []).strayed).toEqual([])
  })

  it('ios does not own an unrelated workflow file', () => {
    expect(checkScope(['.github/workflows/android.yml'], IOS, []).strayed).toEqual([
      '.github/workflows/android.yml',
    ])
  })

  it('infra owns a Dockerfile* glob', () => {
    const INFRA: LaneScope = { owned: ['deploy/', '.github/workflows/', 'site/', 'Dockerfile*', 'knope.toml', 'Caddyfile*'], notOwned: [] }
    expect(checkScope(['Dockerfile.build'], INFRA, []).strayed).toEqual([])
  })

  // --- Ruling 2: longest-match-wins overlap resolution, using REAL fragment data ---
  //
  // These scopes come straight from loadLaneScopes() against the real
  // .claude/agents/fragments/*.md files, not synthetic fixtures — a previous
  // batch in this project shipped three bugs behind fixtures that didn't match
  // real data, and this is the guard against repeating that.

  describe('overlap resolution against real backend/desktop fragments', () => {
    let backend: LaneScope
    let desktop: LaneScope

    beforeAll(async () => {
      const scopes = await loadLaneScopes(process.cwd())
      const b = scopes['backend']
      const d = scopes['desktop']
      if (!b || !d) throw new Error('expected backend and desktop lane fragments to exist')
      backend = b
      desktop = d
    })

    it('parses the real fragments into the expected owned/notOwned lists', () => {
      expect(backend.owned).toEqual([
        'apps/worker/',
        'apps/sip-bridge/',
        'apps/signal-notifier/',
        'tests/features/',
        'tests/steps/',
      ])
      expect(backend.notOwned).toEqual(['tests/', 'tests/mocks/'])
      expect(desktop.owned).toEqual(['apps/desktop/', 'src/client/', 'tests/', 'tests/mocks/', 'playwright.config.ts'])
      expect(desktop.notOwned).toEqual(['tests/features/', 'tests/steps/'])
    })

    it('backend may write tests/features/*.feature — owned tests/features/ (15 chars) beats notOwned tests/ (6 chars)', () => {
      expect(checkScope(['tests/features/auth.feature'], backend, []).strayed).toEqual([])
    })

    it('backend may not write tests/mocks/* — no owned match at all', () => {
      expect(checkScope(['tests/mocks/tauri.ts'], backend, []).strayed).toEqual(['tests/mocks/tauri.ts'])
    })

    it('desktop may not write tests/features/*.feature — notOwned tests/features/ (15) beats owned tests/ (6)', () => {
      expect(checkScope(['tests/features/auth.feature'], desktop, []).strayed).toEqual([
        'tests/features/auth.feature',
      ])
    })

    it('desktop may write tests/helpers.ts — owned tests/ matches, no notOwned match', () => {
      expect(checkScope(['tests/helpers.ts'], desktop, []).strayed).toEqual([])
    })
  })

  it('neverWrite is absolute and beats an owned match, even a longer one', () => {
    const scope: LaneScope = { owned: ['deploy/prod/'], notOwned: [] }
    const r = checkScope(['deploy/prod/values.yaml'], scope, ['deploy/'])
    expect(r.forbidden).toEqual(['deploy/prod/values.yaml'])
    expect(r.strayed).toEqual([])
  })

  it('neverWrite binds even a lane with an empty owned list', () => {
    const r = checkScope(['.env'], { owned: [], notOwned: [] }, ['.env'])
    expect(r.forbidden).toEqual(['.env'])
  })

  it('on an exact-length tie between owned and notOwned, notOwned (deny) wins', () => {
    const scope: LaneScope = { owned: ['apps/ios/'], notOwned: ['apps/ios/' /* same length as owned */] }
    expect(checkScope(['apps/ios/x.swift'], scope, []).strayed).toEqual(['apps/ios/x.swift'])
  })

  // --- G1 regression: bare-filename neverWrite patterns must catch nested secrets ---

  it('marks a nested .env file as forbidden — the case matchesPath used to miss via startsWith', () => {
    const r = checkScope(['apps/worker/config/.env'], { owned: ['apps/worker/'], notOwned: [] }, ['.env'])
    expect(r.forbidden).toEqual(['apps/worker/config/.env'])
    expect(r.strayed).toEqual([])
  })

  // --- G1 specificity check: does a short basename pattern ever outrank a
  // long owned directory pattern in a way that blocks legitimate work? ---
  //
  // neverWrite is checked first and unconditionally (see checkScope's doc
  // comment), so it is immune to this question by construction — it never
  // competes with owned/notOwned length at all. The question only applies to
  // owned-vs-notOwned overlap. Against the real fragments, every directory
  // pattern is at least 5 characters (`site/`) and no lane's `notOwned` list
  // currently contains a bare-filename pattern at all — so the risky
  // configuration (a `notOwned` basename pattern shorter than a competing
  // `owned` directory pattern for the same file) does not occur in the
  // current data. This test demonstrates the safe case holds when a bare
  // basename pattern IS mixed into `notOwned`.
  it('a long owned directory pattern beats a short notOwned basename pattern for the same file', () => {
    const scope: LaneScope = { owned: ['apps/worker/'], notOwned: ['config.ts'] }
    const r = checkScope(['apps/worker/config.ts'], scope, [])
    expect(r.strayed).toEqual([])
  })

  it('flags every already-passing scope case above still holds after the matchesPath fix', () => {
    expect(checkScope(['.github/workflows/ios-e2e.yml'], IOS, []).strayed).toEqual([])
    expect(checkScope(['.github/workflows/android.yml'], IOS, []).strayed).toEqual([
      '.github/workflows/android.yml',
    ])
  })
})
