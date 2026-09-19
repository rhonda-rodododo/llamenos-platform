import { describe, it, expect } from 'vitest'
import { classifyImpact, tierFor, TIER1_PATHS } from '../../orchestrator/src/impact.js'
import { NEVER_WRITE_PATHS, SECRET_PATH_PATTERNS } from '../../orchestrator/src/config.js'

/**
 * Builds a realistic changed-file path for a `matchesPath`/glob pattern so
 * pattern-driven tests below don't need a hand-maintained example per entry
 * — a future addition to SECRET_PATH_PATTERNS is covered automatically.
 * `*` becomes a plausible filename fragment; a bare basename pattern (no
 * `/`) is nested a couple of directories deep to also exercise the
 * basename-matches-at-any-depth behavior `matchesPath` implements.
 */
function realisticPathFor(pattern: string): string {
  const filename = pattern.includes('*') ? pattern.replaceAll('*', 'example-secret') : pattern
  return pattern.includes('/') ? filename : `some/nested/dir/${filename}`
}

describe('classifyImpact', () => {
  it('treats ordinary code as low impact', () => {
    expect(classifyImpact(['src/client/components/Button.tsx'], 20).impact).toBe('low')
  })

  it.each([
    ['packages/crypto/src/hpke.rs'],
    ['packages/protocol/schemas/note.ts'],
    ['packages/protocol/crypto-labels.json'],
    ['apps/worker/lib/auth.ts'],
    ['apps/android/keystore.properties'],
    ['orchestrator/src/tick.ts'],
    ['tests/orchestrator/impact.test.ts'],
  ])('treats %s as high impact', (f) => {
    expect(classifyImpact([f], 5).impact).toBe('high')
  })

  it.each([
    // The orchestrator's own trust base: the fragments that define lane write
    // scope, and the settings file enforcing the write-deny hook.
    ['.claude/agents/fragments/backend.md'],
    ['.claude/settings.json'],
    // sigchain schema/routes — state a revert does not restore. The real
    // tracked file: this used to read `.../sigchain/devices.ts`, a path that
    // has never existed, and it passed anyway because HIGH_IMPACT_PATHS
    // carried the bare prefix `apps/worker/db/schema/sigchain` that
    // `startsWith` matched. Both are the exact file now, and guards.test.ts
    // fails if it ever stops existing without both lists being updated.
    ['apps/worker/db/schema/sigchain.ts'],
    // Middleware and the auth/crypto route and lib surface.
    ['apps/worker/middleware/rate-limit.ts'],
    ['apps/worker/routes/auth.ts'],
    ['apps/worker/routes/sessions.ts'],
    ['apps/worker/routes/webauthn.ts'],
    ['apps/worker/lib/crypto.ts'],
    ['apps/worker/lib/hub-event-crypto.ts'],
    ['apps/worker/lib/push-encryption.ts'],
    ['apps/worker/lib/server-identity.ts'],
    ['apps/worker/lib/agent-identity.ts'],
    ['apps/worker/lib/timing-safe.ts'],
    ['apps/worker/lib/blind-index-query.ts'],
    ['apps/worker/services/crypto-keys.ts'],
    // Shared crypto labels.
    ['packages/shared/crypto-labels.ts'],
    // Key-boundary wrapper paths (restored 2026-09-12 — see impact.ts's
    // CORRECTED comment): not the crypto crate itself, but the surfaces that
    // keep a device private key from leaking — the webview IPC boundary, the
    // Tauri permission grants, and the iOS/Android Keychain/Keystore
    // wrappers. A quiet mistake in any of these is an identity disclosure,
    // which is the high-impact criterion — unrelated to deployment risk, so
    // "no production users yet" never relaxes it.
    ['src/client/lib/platform.ts'],
    ['apps/desktop/src/crypto.rs'],
    ['apps/desktop/capabilities/default.json'],
    ['apps/ios/Sources/Services/CryptoService.swift'],
    ['apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt'],
  ])('treats %s as high impact', (f) => {
    expect(classifyImpact([f], 5).impact).toBe('high')
  })

  // Widened 2026-09-13 (PR #794) to match what CODEOWNERS actually enforces:
  // the whole `.github/workflows/` directory (not just `ci.yml`), plus
  // `knope.toml` (release automation — a supply-chain surface, independent
  // of user count) and the deanonymization surfaces `sip-bridge/` and
  // `signal-notifier/` (caller phone numbers / HMAC-hashed contacts). Not
  // narrowed with the no-users-yet argument: these protect identity and the
  // supply chain, not deployment risk.
  it.each([
    ['.github/workflows/e2e-docker.yml'],
    ['knope.toml'],
    ['sip-bridge/src/ari-adapter.ts'],
    ['signal-notifier/src/contact-resolver.ts'],
  ])('treats %s as high impact', (f) => {
    expect(classifyImpact([f], 5).impact).toBe('high')
  })

  // Boundary-exact: ONLY `apps/desktop/src/crypto.rs` is restored above, not
  // the whole `apps/desktop/src/` directory — an ordinary desktop source file
  // stays low impact.
  it('does not escalate an ordinary desktop source file that is not the crypto IPC wrapper', () => {
    expect(classifyImpact(['apps/desktop/src/main.rs'], 5).impact).toBe('low')
  })

  // NARROWED 2026-09-12 (impact.ts's dated comment): no production users
  // exist yet, so these no longer always-human-gate — the deterministic
  // gates (scope, diff-targeted tests, non-author review, verified-SHA pin)
  // are the decision. Must move back to "high impact" above once the first
  // internal testers are onboarded.
  it.each([
    ['apps/worker/db/migrations/0042_x.sql'],
    ['drizzle/migrations/0001_init.sql'],
    ['packages/shared/migrations/0002_x.sql'],
    ['apps/worker/db/schema/users.ts'],
    // `.github/workflows/ci.yml` and `knope.toml` used to be in this list.
    // Every workflow and knope.toml are HIGH impact now, matching CODEOWNERS
    // (PR #794): the gate's own definition and the release supply chain are
    // the machinery that judges and ships every other PR. Asserted in
    // guards.test.ts instead.
    ['deploy/helm/llamenos/values.yaml'],
    ['apps/ios/fastlane/Fastfile'],
    ['apps/android/fastlane/Fastfile'],
    ['apps/desktop/tauri.conf.json'],
    ['packages/protocol/tools/codegen.ts'],
    ['scripts/inject-cert-pins.ts'],
    ['scripts/extract-cert-pins.sh'],
    ['scripts/verify-build.sh'],
    ['Dockerfile.build'],
  ])('treats %s as low impact (narrowed 2026-09-12 — no production users yet)', (f) => {
    expect(classifyImpact([f], 5).impact).toBe('low')
  })

  it('escalates on a large file count regardless of content', () => {
    const files = Array.from({ length: 41 }, (_, i) => `src/client/x${i}.ts`)
    const r = classifyImpact(files, 100)
    expect(r.impact).toBe('high')
    expect(r.reasons.join(' ')).toMatch(/41 files/)
  })

  it('escalates on a large line count regardless of content', () => {
    const r = classifyImpact(['src/client/a.ts'], 1501)
    expect(r.impact).toBe('high')
    expect(r.reasons.join(' ')).toMatch(/1501 lines/)
  })

  it('gives a reason for every high-impact verdict', () => {
    expect(classifyImpact(['packages/crypto/src/lib.rs'], 5).reasons.length).toBeGreaterThan(0)
  })

  // G2: boundary-exact tests, so a `>` -> `>=` refactor cannot pass silently.
  it('stays low at exactly the file-count threshold, and escalates one file past it', () => {
    const atThreshold = Array.from({ length: 40 }, (_, i) => `src/client/x${i}.ts`)
    expect(classifyImpact(atThreshold, 100).impact).toBe('low')

    const overThreshold = Array.from({ length: 41 }, (_, i) => `src/client/x${i}.ts`)
    expect(classifyImpact(overThreshold, 100).impact).toBe('high')
  })

  it('stays low at exactly the line-count threshold, and escalates one line past it', () => {
    expect(classifyImpact(['src/client/a.ts'], 1500).impact).toBe('low')
    expect(classifyImpact(['src/client/a.ts'], 1501).impact).toBe('high')
  })
})

describe('classifyImpact — secrets always classify high', () => {
  // Every pattern in SECRET_PATH_PATTERNS (config.ts) must classify as high
  // impact, iterated from the real constant so a future addition is covered
  // without a new test.
  it.each(SECRET_PATH_PATTERNS)('treats a file matching secret pattern %s as high impact', (pattern) => {
    const file = realisticPathFor(pattern)
    const result = classifyImpact([file], 5)
    expect(result.impact).toBe('high')
    expect(result.reasons.join(' ')).toMatch(new RegExp(`matches secret pattern`))
  })

  // Guard against the two gates drifting apart again: everything checkScope
  // refuses to write (NEVER_WRITE_PATHS) must also be high-impact here.
  // Iterates the real, currently-configured constants — not a hardcoded
  // copy — so it fails the moment someone adds a never-write pattern without
  // making classifyImpact aware of it.
  it.each(NEVER_WRITE_PATHS)('never-write pattern %s is also high-impact (gates must not drift)', (pattern) => {
    const file = realisticPathFor(pattern)
    expect(classifyImpact([file], 5).impact).toBe('high')
  })

  // The twelve-path probe from the security review: every one is a
  // never-write secret, but before this fix, most classified low because
  // HIGH_IMPACT_PATHS only caught them incidentally via an unrelated
  // directory prefix (apps/ios/fastlane/, deploy/, or the android keystore
  // dir) rather than because they are secrets.
  it.each([
    'apps/android/app/release.jks',
    'apps/android/upload.keystore',
    'apps/ios/fastlane/AuthKey_ABC123.p8',
    'apps/ios/certs/dist.p12',
    'certs/server.pem',
    'deploy/secrets/tls.key',
    '.env',
    'apps/worker/config/.env',
    'apps/android/keystore.properties',
    'id_ed25519',
    '.npmrc',
    'authorized_keys',
  ])('probe path %s classifies high', (file) => {
    expect(classifyImpact([file], 5).impact).toBe('high')
  })
})

describe('tierFor', () => {
  it('classifies documentation prose as Tier 0', () => {
    expect(tierFor(['docs/epics/EP01-foo.md']).tier).toBe(0)
    expect(tierFor(['README.md']).tier).toBe(0)
    expect(tierFor(['apps/worker/README.md']).tier).toBe(0)
  })

  it('an empty diff is Tier 0 — there is nothing to review', () => {
    const r = tierFor([])
    expect(r.tier).toBe(0)
    expect(r.reasons).toEqual([])
  })

  it.each([
    '.claude/agents/backend-supervisor.md',
    '.claude/skills/fleet-review-and-merge/SKILL.md',
    'docs/superpowers/specs/2026-09-19-impact-tiers-addendum.md',
    'lefthook.yml',
    'eslint.config.js',
  ])('classifies %s as Tier 1 (instructions/tooling)', (f) => {
    expect(tierFor([f]).tier).toBe(1)
  })

  // A `.md` file under `.claude/` is instruction text a coding agent obeys,
  // not prose a human reads — it must never fall through to Tier 0 by
  // extension alone. `CLAUDE.md` under `.claude/agents/` is covered by the
  // TIER1_PATHS prefix above; a bare `.claude/CLAUDE.md` (not under
  // agents/ or skills/) is covered by the `.md`-exemption alone and, having
  // no other tier1/tier2-always hit, is Tier 2 by default — never Tier 0.
  it('does not classify a .claude/ markdown file as Tier 0 by extension alone', () => {
    expect(tierFor(['.claude/CLAUDE.md']).tier).not.toBe(0)
  })

  it.each([
    'src/client/components/Button.tsx',
    'apps/worker/routes/notes.ts',
    'apps/ios/Sources/Views/CallView.swift',
  ])('classifies ordinary product code %s as Tier 2 (default)', (f) => {
    expect(tierFor([f]).tier).toBe(2)
  })

  // The Tier 2 "always" list, reused wholesale from HIGH_IMPACT_PATHS
  // (impact.ts's own comment on `tierForFile`'s ordering) — hardcoded
  // examples, not an `it.each(HIGH_IMPACT_PATHS)` iteration, specifically so
  // a mutation that DELETES an entry from that list (e.g. "move
  // packages/crypto/ out of Tier 2") is still caught: iterating the live
  // list would just iterate over fewer entries and silently stop testing
  // the deleted one.
  it.each([
    'packages/crypto/src/hpke.rs',
    'packages/protocol/schemas/note.ts',
    'apps/worker/lib/auth.ts',
    'apps/worker/routes/sessions.ts',
    'orchestrator/src/tick.ts',
    'tests/orchestrator/impact.test.ts',
    '.github/workflows/ci.yml',
    'package.json',
    'bun.lockb',
    'knope.toml',
    'sip-bridge/src/ari-adapter.ts',
    'signal-notifier/src/contact-resolver.ts',
  ])('a Tier 2 path can never be classified lower: %s stays Tier 2', (f) => {
    expect(tierFor([f]).tier).toBe(2)
  })

  // Every SECRET_PATH_PATTERNS entry (config.ts) is also Tier 2 — the same
  // "the two gates must not disagree about secrets" invariant classifyImpact
  // already enforces, extended to the tier axis.
  it.each(SECRET_PATH_PATTERNS)('a file matching secret pattern %s is Tier 2', (pattern) => {
    expect(tierFor([realisticPathFor(pattern)]).tier).toBe(2)
  })

  // The overlap this file's own comments call out: `.claude/agents/` and
  // `lefthook.yml` are members of BOTH `HIGH_IMPACT_PATHS` (classifyImpact
  // still calls them "high impact") and `TIER1_PATHS` — and Tier 1 must win
  // for the tier question, without editing `HIGH_IMPACT_PATHS`.
  it.each(['.claude/agents/backend-supervisor.md', 'lefthook.yml'])(
    '%s is high-impact (classifyImpact) but only Tier 1 (tierFor) — the two axes disagree on purpose',
    (f) => {
      expect(classifyImpact([f], 5).impact).toBe('high')
      expect(tierFor([f]).tier).toBe(1)
    },
  )

  it('a diff spanning tiers takes the HIGHEST tier it touches', () => {
    const mixed = tierFor(['docs/readme.md', '.claude/agents/backend-supervisor.md', 'packages/crypto/src/lib.rs'])
    expect(mixed.tier).toBe(2)
    expect(mixed.reasons.join(' ')).toMatch(/packages\/crypto/)
    // The Tier 0/1 files did not decide the outcome — they are not named in
    // the winning reasons.
    expect(mixed.reasons.join(' ')).not.toMatch(/docs\/readme\.md/)

    const tier1AndTier0 = tierFor(['docs/readme.md', '.claude/agents/backend-supervisor.md'])
    expect(tier1AndTier0.tier).toBe(1)
  })

  it('gives a reason naming every file that contributed to the winning tier', () => {
    const r = tierFor(['packages/crypto/src/a.rs', 'apps/worker/lib/auth.ts'])
    expect(r.tier).toBe(2)
    expect(r.reasons).toHaveLength(2)
  })

  // Every TIER1_PATHS entry must actually match a realistic path under it —
  // same discipline as the HIGH_IMPACT_PATHS/CODEOWNERS coverage rail in
  // guards.test.ts, applied to the new list.
  it.each(TIER1_PATHS)('TIER1_PATHS entry %s matches a realistic path under it', (p) => {
    const file = p.endsWith('/') ? `${p}example.md` : p
    expect(tierFor([file]).tier).toBe(1)
  })
})
