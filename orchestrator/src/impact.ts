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
 * gate — `classifyImpact` marked a diff high and `mayAutoMerge` refused it —
 * enforcement nothing outside this process could see, and therefore nothing
 * outside this process was bound by. Every path below is owned in
 * `CODEOWNERS`, where GitHub's own "require review from Code Owners" rule
 * binds anyone, whoever or whatever opened the PR.
 * `tests/orchestrator/guards.test.ts` asserts that coverage against the real
 * tree, so a path added here without a matching `CODEOWNERS` line fails the
 * suite.
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
  // Every entry below is a REAL tracked path — a directory prefix ending in
  // `/`, or an exact file. That is not cosmetic: these same strings are the
  // `CODEOWNERS` lines, and CODEOWNERS is gitignore syntax, where a bare
  // `apps/worker/lib/auth` matches a file NAMED `auth` and therefore matches
  // nothing at all in this repo. An entry here that matches no tracked file
  // is a gate that silently protects nothing, so `guards.test.ts` asserts
  // both directions against `git ls-files`: every path here matches at least
  // one real file, and every real file under it is owned in CODEOWNERS.
  'packages/crypto/',
  'packages/protocol/schemas/',
  'packages/protocol/crypto-labels.json',
  'packages/shared/crypto-labels.ts',
  'orchestrator/',
  'tests/orchestrator/',

  // Key-boundary surfaces. Not the crypto crate itself, but the places that
  // keep (or could leak) a device private key: the webview IPC boundary, the
  // Tauri permission grants, the iOS/Android Keychain/Keystore wrappers, and
  // the Tauri IPC mock, which mirrors the Rust CryptoState.
  'src/client/lib/platform.ts',
  'apps/desktop/src/crypto.rs',
  'apps/desktop/capabilities/',
  'apps/ios/Sources/Services/CryptoService.swift',
  'apps/android/app/src/main/java/org/llamenos/hotline/crypto/',
  'tests/mocks/',

  // The fleet's own trust base: a worker that edits the orchestrator, the
  // agent definitions bounding its own behaviour, or the write-deny hook can
  // widen its own authority.
  '.claude/agents/',
  '.claude/settings.json',

  // The build's own trust base, and the reason this list gained entries in
  // the round that fixed the gate. The gate jobs install from the lockfile
  // and run from the workflow definition; a PR editing any of these is a PR
  // editing the machinery that judges it. `ci.yml` most of all — it is where
  // "check out the base, not the head" is written down.
  'package.json',
  'bun.lockb',
  'lefthook.yml',
  '.github/workflows/ci.yml',
  // The vitest configs. `fleet/verify` no longer loads a PR's copy of these
  // (verify.ts installs the base's bytes over it), but whatever lands on main
  // IS what vitest's main process executes when judging every later PR —
  // including its `globalSetup` and plugins. Exact files, one per config: this
  // list is prefix/exact matching, and `CODEOWNERS` owns the `vitest.*.config.ts`
  // glob so a new config is owned before anyone remembers to list it here
  // (guards.test.ts fails until they do).
  'vitest.desktop.config.ts',
  'vitest.integration.config.ts',
  'vitest.orchestrator.config.ts',
  'vitest.unit.config.ts',

  // Auth, sessions, sigchain, identity: state a revert does not restore.
  // `.test.ts` siblings are listed explicitly — weakening the test is the
  // shortest route to disabling the check it guards.
  'apps/worker/middleware/',
  'apps/worker/lib/auth.ts',
  'apps/worker/lib/auth.test.ts',
  'apps/worker/lib/webauthn.ts',
  'apps/worker/lib/session-renewal.ts',
  'apps/worker/lib/crypto.ts',
  'apps/worker/lib/crypto.test.ts',
  'apps/worker/lib/hub-event-crypto.ts',
  'apps/worker/lib/push-encryption.ts',
  'apps/worker/lib/server-identity.ts',
  'apps/worker/lib/agent-identity.ts',
  'apps/worker/lib/timing-safe.ts',
  'apps/worker/lib/blind-index-query.ts',
  'apps/worker/lib/blind-index-query.test.ts',
  'apps/worker/routes/auth.ts',
  'apps/worker/routes/sessions.ts',
  'apps/worker/routes/webauthn.ts',
  'apps/worker/routes/sigchain.ts',
  'apps/worker/db/schema/sigchain.ts',
  'apps/worker/services/crypto-keys.ts',
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
