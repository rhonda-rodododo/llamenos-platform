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
  // and run from workflow definitions; a PR editing any of these is a PR
  // editing the machinery that judges it or the supply chain around a
  // release. Widened from the single `ci.yml` entry to the whole
  // `.github/workflows/` directory (PR #794) to match what CODEOWNERS
  // actually enforces — the impact classifier disagreeing with CODEOWNERS
  // about which workflow files are high-impact is worse than a broad match.
  'package.json',
  'bun.lockb',
  'lefthook.yml',
  '.github/workflows/',
  'knope.toml',
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

  // Deanonymization surfaces (PR #794, matching CODEOWNERS): sip-bridge/
  // routes PSTN calls and handles caller phone numbers; signal-notifier/
  // does HMAC-hashed contact resolution. Both are top-level, NOT under
  // apps/ despite what older docs say.
  'sip-bridge/',
  'signal-notifier/',

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

// ---------------------------------------------------------------------------
// Impact TIERS — a second, independent axis from `classifyImpact` above.
//
// `classifyImpact`'s low/high decides how CAREFULLY a review reads a diff
// that is already going to be reviewed (more reviewer turns, a longer
// timeout — see review.ts's HIGH_IMPACT_MAX_TURNS/HIGH_IMPACT_TIMEOUT_MS).
// It never decided whether a review runs at all, and still doesn't.
//
// A tier decides that: how much CEREMONY a diff's blast radius earns before
// it may land, from "cheap repo checks only" up to "the full gate,
// including a non-author model review." Operator rule, 2026-09-19: "the
// ceremony should scale with impact too. A documentation fix should not
// wait on a model review; an instruction change should not wait on the
// mobile suites; crypto should wait on everything." This is the ONE place
// that rule is defined — `fleet/review`'s decision step (`decideReviewGate`,
// ci.ts) and the CI job path-scoping (`.github/scripts/detect-changed-
// platforms.sh`, once #862 lands — see the note above `TIER1_PATHS`) both
// consume `tierFor` rather than re-deriving their own notion of "this diff
// doesn't need X."
//
//   Tier 0 — no executable content: `docs/**`, `*.md` outside `.claude/`,
//     spec prose. Nothing here can affect runtime behavior. Waits on cheap
//     repo checks only (lint/typecheck where applicable) — no model review,
//     ever.
//   Tier 1 — instructions and tooling that shape FUTURE work, never
//     runtime behavior today: agent/skill definitions, specs that carry an
//     invariant this repo's own gates rely on, lint/format/hook config.
//     Waits on cheap checks + code-owner review (every Tier 1 path is
//     already, or should be, CODEOWNERS-protected). No model review, no
//     e2e/mobile suites.
//   Tier 2 — everything else, and ALWAYS: product code, `packages/crypto/`,
//     auth/session/sigchain, `packages/protocol/schemas/`,
//     `.github/workflows/`, `orchestrator/`, `tests/orchestrator/`,
//     dependency manifests. Waits on the full gate, including the
//     non-author model review.
//
// A diff spanning tiers takes the HIGHEST tier it touches — never an
// average, never "mostly docs." `tierFor` below is that computation.
// ---------------------------------------------------------------------------

export type ImpactTier = 0 | 1 | 2

/**
 * Documentation prose: everything under `docs/`, and any `*.md` file
 * anywhere else in the tree — a README can live next to the code it
 * documents, so Tier 0 cannot be a `docs/`-prefix check alone.
 *
 * `.claude/` is explicitly exempt from the `*.md` rule: an agent or skill
 * definition happens to use the same extension as a README, but it is
 * instruction text a coding agent OBEYS, not prose a human reads — see
 * `TIER1_PATHS` below, which is what actually classifies it.
 * `docs/superpowers/specs/` is carved back OUT of Tier 0 for the same
 * reason: a spec can carry an invariant this repo's own gates depend on
 * (`TIER1_PATHS` checks it first — see `tierForFile`'s ordering comment).
 *
 * Deliberately does NOT attempt to detect a comment-only CODE diff: that
 * needs the diff's own content, and no caller of `tierFor` currently plumbs
 * full diff text through it — only the changed-file list. A real follow-up,
 * left undone rather than guessed at; see this file's own history (the
 * `k2p6` / `--format text` comments in review.ts) for why this codebase
 * verifies a claim before shipping it rather than assuming a shape it never
 * checked.
 */
export const TIER0_DOC_DIR = 'docs/'

/** `*.md` under this prefix is instruction text, not prose — see
 *  `TIER0_DOC_DIR`'s comment. */
const TIER0_MD_EXEMPT_PREFIX = '.claude/'

function isTier0Path(f: string): boolean {
  if (f.startsWith(TIER0_MD_EXEMPT_PREFIX)) return false
  if (f.startsWith(TIER0_DOC_DIR)) return true
  return f.endsWith('.md')
}

/**
 * Instructions and tooling that shape FUTURE work — never product behavior
 * at runtime today. `.claude/agents/` and `lefthook.yml` are ALSO members of
 * `HIGH_IMPACT_PATHS` above (added there for a different, still-valid
 * reason: a worker that edits its own agent definition, or the hook
 * enforcing write-deny, can widen its own authority — see that constant's
 * "fleet's own trust base" comment). `tierForFile` checks `TIER1_PATHS`
 * BEFORE `HIGH_IMPACT_PATHS`, so this list's classification is the one that
 * wins for the NEW question this file answers ("does a model review run at
 * all") — without editing `HIGH_IMPACT_PATHS` or its still-valid `low`/
 * `high` axis (a Tier 1 diff under `.claude/agents/` still reads `high` from
 * `classifyImpact`; it simply never reaches a reviewer that would use that
 * signal, because Tier 1 never requests one).
 *
 * `.claude/agents/` and `lefthook.yml` are already CODEOWNERS-protected
 * (verified against the tracked `CODEOWNERS` file). `.claude/skills/`,
 * `docs/superpowers/specs/`, and the lint/editor configs below are NOT yet
 * owned there — `CODEOWNERS` is outside this change's owned paths
 * (`orchestrator/`, `tests/orchestrator/`, `.github/workflows/`,
 * `docs/superpowers/specs/`), so adding those lines is a follow-up for
 * whoever owns that file, not done here. Until then, a Tier 1 diff under one
 * of those three still skips the model review (the tier itself does not
 * depend on CODEOWNERS coverage) but does not yet get the code-owner review
 * this tier's own definition promises it.
 */
export const TIER1_PATHS: readonly string[] = [
  '.claude/agents/',
  '.claude/skills/',
  'docs/superpowers/specs/',
  'lefthook.yml',
  '.editorconfig',
  'eslint.config.js',
  'eslint.config.ts',
  '.eslintrc.json',
  '.eslintrc.js',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
]

function tier1Hit(f: string): string | undefined {
  return TIER1_PATHS.find((p) => f.startsWith(p) || f.includes(`/${p}`))
}

/**
 * One changed file's tier, and why. Order is the whole design:
 *
 * 1. `TIER1_PATHS` first — so its two overlaps with `HIGH_IMPACT_PATHS`
 *    (`.claude/agents/`, `lefthook.yml`) resolve to Tier 1 without editing
 *    that list. No other `HIGH_IMPACT_PATHS`/secret-pattern entry overlaps a
 *    `TIER1_PATHS` prefix today — pinned by the "never demoted" tests in
 *    `tests/orchestrator/impact.test.ts`, which iterate the real
 *    `HIGH_IMPACT_PATHS`/`SECRET_PATH_PATTERNS` constants (not a hand-copied
 *    duplicate) so a future entry that accidentally gains an overlap fails
 *    the suite immediately.
 * 2. `HIGH_IMPACT_PATHS` and the secret patterns — the Tier 2 "always" list.
 *    Reused wholesale from `classifyImpact` above rather than re-curated:
 *    two lists of "which paths are sensitive" that could drift apart is
 *    exactly the failure mode this project's own comments warn against
 *    elsewhere (see `CRYPTO_REVIEW_PATHS` in review.ts).
 * 3. `TIER0_DOC_DIR`/`.md` — prose.
 * 4. Otherwise Tier 2: the default. "Everything else" in this file's own
 *    module comment is not a residual case handled by falling through with
 *    no logic — it is this line, stated as code.
 */
function tierForFile(f: string): { tier: ImpactTier; reason: string } {
  const t1 = tier1Hit(f)
  if (t1 !== undefined) {
    return { tier: 1, reason: `${f} is Tier 1 (instructions/tooling) — under ${t1}` }
  }
  const alwaysHit = HIGH_IMPACT_PATHS.find((p) => f.startsWith(p) || f.includes(`/${p}`))
  if (alwaysHit !== undefined) {
    return { tier: 2, reason: `${f} is Tier 2 (always) — under high-impact path ${alwaysHit}` }
  }
  const secretHit = SECRET_PATH_PATTERNS.find((p) => matchesPath(f, p))
  if (secretHit !== undefined) {
    return { tier: 2, reason: `${f} is Tier 2 (always) — matches secret pattern ${secretHit}` }
  }
  if (isTier0Path(f)) {
    return { tier: 0, reason: `${f} is Tier 0 (no executable content)` }
  }
  return { tier: 2, reason: `${f} is Tier 2 (default) — product code` }
}

export interface TierResult {
  tier: ImpactTier
  /** Explains every file that CONTRIBUTED to the winning tier — not every
   *  changed file. A Tier 0 file sitting alongside the Tier 2 file that
   *  actually decided the outcome would only be noise here. */
  reasons: string[]
}

/**
 * The diff's tier: the HIGHEST tier any changed file touches. A diff with no
 * changed files is Tier 0 — there is nothing to review, which is exactly
 * the "no reviewable content" a Tier 0/1 diff is defined by.
 *
 * The single source of truth for "how much ceremony does this diff earn" —
 * `fleet/review`'s decision step (`decideReviewGate`, ci.ts) is the first
 * consumer; CI's platform path-scoping (`.github/scripts/detect-changed-
 * platforms.sh`) is designed to consume this same function once #862 lands
 * (see that PR's own script — it currently derives its `docs_only`/platform
 * flags from an independent bash regex map, which this comment does not
 * change; unifying a bash script's classification onto a TypeScript
 * function needs that script to shell out to `bun`, which is out of scope
 * for this change and left as a follow-up named in this PR's description).
 */
export function tierFor(changedFiles: string[]): TierResult {
  let tier: ImpactTier = 0
  const perFile = changedFiles.map((f) => ({ file: f, ...tierForFile(f) }))
  for (const p of perFile) {
    if (p.tier > tier) tier = p.tier
  }
  const reasons = perFile.filter((p) => p.tier === tier).map((p) => p.reason)
  return { tier, reasons }
}
