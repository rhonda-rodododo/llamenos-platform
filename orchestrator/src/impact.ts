import { SECRET_PATH_PATTERNS } from './config.js'
import { matchesPath } from './fragments.js'

export const LARGE_DIFF_FILES = 40
export const LARGE_DIFF_LINES = 1500

/**
 * Each entry is here because a mistake behind it is expensive in a way CI does
 * not catch. Crypto and protocol: a quiet error becomes an identity disclosure,
 * which is the whole threat model. Auth and sigchain: state a revert does not
 * restore. orchestrator/ and its tests: a defect there disables the checks that
 * would have caught it, and weakening its tests is the same hazard by a
 * shorter route.
 *
 * NOT the full secrets list: every path `checkScope` refuses to write
 * (`SECRET_PATH_PATTERNS` in config.ts, the never-write source of truth) is
 * also classified high-impact below via `matchesPath`, so this array need not
 * duplicate secret filename patterns — see the `secretHit` check in
 * `classifyImpact`.
 *
 * NARROWED 2026-09-12: this list used to also always-human-gate `deploy/`,
 * `.github/workflows/`, migrations, fastlane, `Dockerfile.build`, `knope.toml`,
 * and the cert-pin/verify-build scripts. That policy was set assuming
 * production users; there are none yet, so a bad deploy config or a broken CI
 * workflow hurts nobody, and gating it behind a human was pure latency with no
 * offsetting safety benefit. The fleet's first live PR (#662, a two-line
 * OpenTofu fix) stopped at the merge gate for exactly this reason. With no
 * users, the deterministic gates — scope, diff-targeted tests, a
 * different-engine non-author review, and the verified-SHA pin in merge.ts —
 * ARE the decision for those paths now; they merge on green without a human.
 * `deploy/`, `.github/workflows/`, and the migration paths below MUST return
 * to this list before the first internal testers are onboarded — a bad
 * migration or deploy config stops being harmless the moment real data or
 * real callers exist.
 *
 * CORRECTED 2026-09-12 (same day): the first pass of the narrowing above also
 * removed the desktop IPC / capabilities and mobile crypto-service *wrapper*
 * paths (`src/client/lib/platform.ts`, `apps/desktop/src/crypto.rs`,
 * `apps/desktop/capabilities/`, the iOS/Android `CryptoService` files),
 * reasoning that they weren't `packages/crypto/` itself. That was wrong: a
 * quiet mistake in any of them is an identity disclosure — `platform.ts` is,
 * per CLAUDE.md, the SINGLE abstraction keeping a device private key out of
 * the webview; `crypto.rs`/`capabilities/` are the IPC surface and Tauri
 * permission grants that could expose it; the iOS/Android files are the
 * Keychain/Keystore boundary. That is the high-impact criterion (a quiet
 * error becomes an identity disclosure), and it has nothing to do with
 * deployment risk — "no users yet" does not relax it. They are restored
 * below and must never be narrowed on the same "no users" reasoning that
 * applies to `deploy/` and CI.
 */
export const HIGH_IMPACT_PATHS: readonly string[] = [
  'packages/crypto/',
  'packages/protocol/schemas/',
  'packages/protocol/crypto-labels.json',
  'apps/worker/lib/auth',
  'apps/worker/lib/webauthn',
  'apps/worker/lib/session',
  'apps/android/keystore',
  'orchestrator/',
  'tests/orchestrator/',

  // Key-boundary wrapper paths — restored 2026-09-12 (see the CORRECTED
  // comment above). Not the crypto crate itself, but the surfaces that keep
  // (or could leak) a device private key: the webview IPC boundary, the
  // Tauri permission grants, and the iOS/Android Keychain/Keystore wrappers.
  'src/client/lib/platform.ts',
  'apps/desktop/src/crypto.rs',
  'apps/desktop/capabilities/',
  'apps/ios/Sources/Services/CryptoService.swift',
  'apps/android/app/src/main/java/org/llamenos/hotline/crypto/',

  // These two are the other half of the orchestrator's own trust base: it
  // already treats its own source as high-impact, but a worker that edits the
  // fragment defining its own lane's write scope — or the settings file
  // enforcing the PreToolUse write-deny hook — can widen its own authority
  // without ever touching `orchestrator/`.
  '.claude/agents/fragments/',
  '.claude/settings.json',

  'apps/worker/middleware/',
  'apps/worker/routes/auth',
  'apps/worker/routes/sessions',
  'apps/worker/routes/webauthn',
  'apps/worker/routes/sigchain',
  'apps/worker/db/schema/sigchain',
  'apps/worker/lib/crypto',
  'apps/worker/lib/hub-event-crypto',
  'apps/worker/lib/push-encryption',
  'apps/worker/lib/server-identity',
  'apps/worker/lib/agent-identity',
  'apps/worker/lib/timing-safe',
  'apps/worker/lib/blind-index-query',
  'apps/worker/services/crypto-keys',
  'packages/shared/crypto-labels.ts',
]

export function classifyImpact(
  changedFiles: string[],
  addedLines: number,
): { impact: 'low' | 'high'; reasons: string[] } {
  const reasons: string[] = []
  for (const f of changedFiles) {
    const hit = HIGH_IMPACT_PATHS.find((p) => f.startsWith(p) || f.includes(`/${p}`))
    if (hit) reasons.push(`${f} is under high-impact path ${hit}`)
    // The two gates must not disagree about secrets: anything NEVER_WRITE_PATHS
    // (config.ts) would refuse to write is high-impact here too, so a secret
    // that reaches a diff by a route the write gate did not cover still
    // always requires human review rather than auto-merging.
    const secretHit = SECRET_PATH_PATTERNS.find((p) => matchesPath(f, p))
    if (secretHit) reasons.push(`${f} matches secret pattern ${secretHit} (never-write and high-impact)`)
  }
  if (changedFiles.length > LARGE_DIFF_FILES) {
    reasons.push(`${changedFiles.length} files exceeds the ${LARGE_DIFF_FILES}-file review threshold`)
  }
  if (addedLines > LARGE_DIFF_LINES) {
    reasons.push(`${addedLines} lines exceeds the ${LARGE_DIFF_LINES}-line review threshold`)
  }
  return { impact: reasons.length > 0 ? 'high' : 'low', reasons }
}
