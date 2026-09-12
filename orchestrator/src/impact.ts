import { SECRET_PATH_PATTERNS } from './config.js'
import { matchesPath } from './fragments.js'

export const LARGE_DIFF_FILES = 40
export const LARGE_DIFF_LINES = 1500

/**
 * The paths where a quiet mistake is expensive in a way CI does not catch.
 * Crypto and protocol: a quiet error becomes an identity disclosure, which
 * is the whole threat model. Auth and sigchain: state a revert does not
 * restore. `orchestrator/` and its tests: a defect there disables the checks
 * that would have caught it.
 *
 * THIS LIST NO LONGER GATES ANYTHING. It used to be half of a userland merge
 * gate — `classifyImpact` marked a diff high, and the orchestrator's own
 * merge function refused it. Nothing outside this process knew, so nothing
 * outside this process was bound by it. Enforcement is now GitHub's "require
 * review from Code Owners" rule over `CODEOWNERS`, where every path below is
 * owned: a PR touching one cannot merge until the owner approves, whoever or
 * whatever opened it. `tests/orchestrator/guards.test.ts` asserts that
 * coverage directly, so a path added here without a matching `CODEOWNERS`
 * line fails the suite.
 *
 * What survives here is DESCRIPTION, not decision: the gate trace, the
 * digest, the reviewer's turn and timeout budget (review.ts), and the subset
 * `CRYPTO_REVIEW_PATHS` derives for the crypto-security-reviewer.
 *
 * NOT the full secrets list: every path `checkScope` refuses to write
 * (`SECRET_PATH_PATTERNS` in config.ts, the never-write source of truth) is
 * also classified high-impact below via `matchesPath` — see the `secretHit`
 * check in `classifyImpact`.
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
