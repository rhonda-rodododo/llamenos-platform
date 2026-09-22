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
        'sip-bridge/',
        'signal-notifier/',
        'tests/steps/backend/',
        '.github/ci/*-baseline.json',
        'packages/i18n/locales/',
      ])
      expect(backend.notOwned).toEqual([
        'tests/',
        'tests/mocks/',
        'packages/test-specs/',
        'packages/i18n/languages.ts',
        'packages/i18n/tools/',
      ])
      expect(desktop.owned).toEqual([
        'apps/desktop/',
        'src/client/',
        'tests/',
        'tests/mocks/',
        'playwright.config.ts',
        '.github/ci/*-baseline.json',
        'packages/i18n/locales/',
      ])
      expect(desktop.notOwned).toEqual([
        'tests/steps/backend/',
        'packages/test-specs/',
        'packages/i18n/languages.ts',
        'packages/i18n/tools/',
      ])
    })

    it('backend may write tests/steps/backend/scope.steps.ts — owned tests/steps/backend/ (20 chars) beats notOwned tests/ (6 chars)', () => {
      expect(checkScope(['tests/steps/backend/scope.steps.ts'], backend, []).strayed).toEqual([])
    })

    it('backend may not write tests/mocks/* — no owned match at all', () => {
      expect(checkScope(['tests/mocks/tauri.ts'], backend, []).strayed).toEqual(['tests/mocks/tauri.ts'])
    })

    it('desktop may not write tests/steps/backend/scope.steps.ts — notOwned tests/steps/backend/ (20) beats owned tests/ (6)', () => {
      expect(checkScope(['tests/steps/backend/scope.steps.ts'], desktop, []).strayed).toEqual([
        'tests/steps/backend/scope.steps.ts',
      ])
    })

    it('desktop may write tests/helpers.ts — owned tests/ matches, no notOwned match', () => {
      expect(checkScope(['tests/helpers.ts'], desktop, []).strayed).toEqual([])
    })
  })

  // --- tests/steps/ ownership fix: only tests/steps/backend/ is backend's ---
  //
  // The fragment used to say backend owns the whole tests/steps/ tree ("Step
  // definitions organized by domain") and desktop does NOT own any of it.
  // That was wrong at the file-content level: of the 144 *.ts files under
  // tests/steps/, 139 import `@playwright/test` and drive a real browser
  // `page` fixture — Playwright is desktop-only tooling (CLAUDE.md: "E2E via
  // Playwright (desktop)"), and the two files under tests/steps/ that don't
  // import it but still live outside tests/steps/backend/ (common/before-hooks.ts,
  // config/test-backend-server.ts) turn out to be desktop-only too on inspection
  // (page.addInitScript / a harness proving desktop's net_fetch origin
  // handling). The only genuinely API-only, browser-free step code lives
  // under tests/steps/backend/ — and playwright.config.ts's own `backend-bdd`
  // project definition says so directly: `steps: "tests/steps/backend/**/*.ts"`,
  // while its `bdd` (desktop) project loads every other tests/steps/<dir>
  // via `desktopStepDirs`. Five separate PRs in the 2026-09-22 fleet/verify
  // triage (#853, #854, #897, #916, #917) were desktop E2E flake fixes
  // (isVisible()/.first() probe sweeps — a defect that can only exist in
  // browser-driving code) rejected as "outside lane desktop's scope" for
  // touching tests/steps/<domain>/*.ts files that are desktop's in every
  // way except this one stale ownership line.
  //
  // The fix narrows backend's grant from all of tests/steps/ down to
  // tests/steps/backend/ (mirroring desktop's existing notOwned carve-out,
  // now equally narrowed) — not a blanket grant of tests/steps/ to desktop;
  // desktop already owns everything under tests/ via its unchanged `tests/`
  // entry, once the over-broad backend notOwned/owned pair no longer shadows it.

  describe('tests/steps/ ownership fix: tests/steps/backend/ is backend-exclusive, everything else under tests/steps/ is desktop-exclusive', () => {
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

    // (a) the actual files from the five rejected PRs are now in-scope for desktop.
    it.each([
      'tests/steps/cases/cms-cases-steps.ts', // #853, #917
      'tests/steps/cases/cms-events-steps.ts', // #854
      'tests/steps/calls/call-steps.ts', // #897
      'tests/steps/hub/hub-steps.ts', // #897
      'tests/steps/messaging/conversations-full-steps.ts', // #897
      'tests/steps/notes/note-steps.ts', // #897
      'tests/steps/reports/report-steps.ts', // #897
      'tests/steps/security/security-steps.ts', // #897
      'tests/steps/admin/admin-settings-steps.ts', // #916
      'tests/steps/common/interaction-steps.ts', // #916
      'tests/steps/notes/custom-fields-steps.ts', // #916
      'tests/steps/settings/erasure-steps.ts', // #916
    ])('desktop may write %s', (file) => {
      expect(checkScope([file], desktop, []).strayed).toEqual([])
    })

    // (b) backend keeps exactly its own subdirectory.
    it('backend may write a new file under tests/steps/backend/', () => {
      expect(checkScope(['tests/steps/backend/new-domain.steps.ts'], backend, []).strayed).toEqual([])
    })

    // (c) the boundary is not widened past tests/steps/backend/ in either direction.
    it('backend may NOT write into any other tests/steps/ directory', () => {
      const r = checkScope(
        ['tests/steps/cases/cms-cases-steps.ts', 'tests/steps/admin/admin-settings-steps.ts'],
        backend,
        [],
      )
      expect(r.strayed).toEqual([
        'tests/steps/cases/cms-cases-steps.ts',
        'tests/steps/admin/admin-settings-steps.ts',
      ])
    })

    it('desktop may NOT write into tests/steps/backend/ — backend keeps its exclusive subdirectory', () => {
      expect(checkScope(['tests/steps/backend/recovery-group.steps.ts'], desktop, []).strayed).toEqual([
        'tests/steps/backend/recovery-group.steps.ts',
      ])
    })

    // (d) adjacent grants this fix must NOT touch stay exactly as they were.
    it('backend still does not own tests/mocks/ or packages/test-specs/', () => {
      expect(checkScope(['tests/mocks/tauri.ts'], backend, []).strayed).toEqual(['tests/mocks/tauri.ts'])
      expect(checkScope(['packages/test-specs/features/x.feature'], backend, []).strayed).toEqual([
        'packages/test-specs/features/x.feature',
      ])
    })

    it('desktop still does not own packages/test-specs/ or the shared i18n files', () => {
      expect(checkScope(['packages/test-specs/features/x.feature'], desktop, []).strayed).toEqual([
        'packages/test-specs/features/x.feature',
      ])
      expect(checkScope(['packages/i18n/languages.ts'], desktop, []).strayed).toEqual([
        'packages/i18n/languages.ts',
      ])
    })
  })

  // --- .github/ci/*-baseline.json grant extended to backend (#887) ---
  //
  // Desktop already owned `.github/ci/*-baseline.json` (its own tsc/lint
  // baseline tracker). Backend doing the exact same kind of work — clearing
  // its own baselined tsc debt under tests/steps/backend/ — hit the same gap
  // desktop's grant already solved for desktop, just never extended to
  // backend. This mirrors PR #938's shape: a narrow, precedented grant, not
  // a new category of risk (desktop has held unrestricted write access to
  // this exact glob all along).

  describe('.github/ci/*-baseline.json grant extended to backend (#887)', () => {
    let backend: LaneScope

    beforeAll(async () => {
      const scopes = await loadLaneScopes(process.cwd())
      const b = scopes['backend']
      if (!b) throw new Error('expected backend lane fragment to exist')
      backend = b
    })

    it('backend may write .github/ci/tsc-tests-baseline.json', () => {
      expect(checkScope(['.github/ci/tsc-tests-baseline.json'], backend, []).strayed).toEqual([])
    })

    it('the grant is scoped to *-baseline.json — backend still may not write .github/ci/audit-allowlist.txt', () => {
      expect(checkScope(['.github/ci/audit-allowlist.txt'], backend, []).strayed).toEqual([
        '.github/ci/audit-allowlist.txt',
      ])
    })

    it('the grant does not widen into the rest of .github/ — backend still may not write .github/workflows/ci.yml', () => {
      expect(checkScope(['.github/workflows/ci.yml'], backend, []).strayed).toEqual([
        '.github/workflows/ci.yml',
      ])
    })
  })

  // --- i18n lane-scope fix: platform lanes may add localized strings, but
  // only under packages/i18n/locales/. The rest of packages/i18n/ (the locale
  // list, codegen, validators) stays exclusive to shared-supervisor. Before
  // this fix, none of the four platform lanes owned any part of
  // packages/i18n/, so a feature PR that added a string (mandatory per the
  // project's i18n rule — see CLAUDE.md/i18n-string-workflow) was structurally
  // unmergeable: fleet/verify rejected the locale file as out-of-lane no
  // matter which platform authored the feature (observed on PRs #920, #917).

  describe('i18n lane-scope fix: platform lanes may write packages/i18n/locales/ only', () => {
    let desktop: LaneScope
    let backend: LaneScope
    let ios: LaneScope
    let android: LaneScope
    let shared: LaneScope

    beforeAll(async () => {
      const scopes = await loadLaneScopes(process.cwd())
      const d = scopes['desktop']
      const b = scopes['backend']
      const i = scopes['ios']
      const a = scopes['android']
      const s = scopes['shared']
      if (!d || !b || !i || !a || !s) throw new Error('expected desktop/backend/ios/android/shared lane fragments to exist')
      desktop = d
      backend = b
      ios = i
      android = a
      shared = s
    })

    // (a) a platform-lane diff touching packages/i18n/locales/ is in scope.
    it.each(['desktop', 'backend', 'ios', 'android'] as const)(
      '%s may add/update a localized string under packages/i18n/locales/',
      (lane) => {
        const scope = { desktop, backend, ios, android }[lane]
        expect(checkScope(['packages/i18n/locales/en.json'], scope, []).strayed).toEqual([])
      },
    )

    // (b) the same lane touching packages/i18n/languages.ts or
    // packages/i18n/tools/ is still out of scope — the narrow grant to
    // locales/ must not widen into the rest of packages/i18n/.
    it.each(['desktop', 'backend', 'ios', 'android'] as const)(
      '%s may not touch packages/i18n/languages.ts (shared-supervisor exclusive)',
      (lane) => {
        const scope = { desktop, backend, ios, android }[lane]
        expect(checkScope(['packages/i18n/languages.ts'], scope, []).strayed).toEqual([
          'packages/i18n/languages.ts',
        ])
      },
    )

    it.each(['desktop', 'backend', 'ios', 'android'] as const)(
      '%s may not touch packages/i18n/tools/ (shared-supervisor exclusive)',
      (lane) => {
        const scope = { desktop, backend, ios, android }[lane]
        expect(checkScope(['packages/i18n/tools/i18n-codegen.ts'], scope, []).strayed).toEqual([
          'packages/i18n/tools/i18n-codegen.ts',
        ])
      },
    )

    // (c) shared lane is unaffected — it still owns everything under
    // packages/i18n/, locales/ included, via its unchanged `packages/i18n/`
    // owned entry.
    it('shared lane still owns packages/i18n/locales/, packages/i18n/languages.ts, and packages/i18n/tools/', () => {
      expect(checkScope(['packages/i18n/locales/en.json'], shared, []).strayed).toEqual([])
      expect(checkScope(['packages/i18n/languages.ts'], shared, []).strayed).toEqual([])
      expect(checkScope(['packages/i18n/tools/i18n-codegen.ts'], shared, []).strayed).toEqual([])
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
