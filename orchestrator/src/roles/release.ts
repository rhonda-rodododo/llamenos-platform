/**
 * The Release engineer role: runs store and deploy pipelines, verifies the
 * artifacts they produce, and reports. Every constraint below is load-
 * bearing, not aspirational — this file is deliberately incapable of doing
 * several things a "release engineer" title might suggest it can do, and
 * the comments say so plainly rather than leaving that capability implied.
 *
 * This role NEVER merges a pull request. There is no function anywhere in
 * this module that calls `gh pr merge`, or imports `mergePr` from
 * `../merge.js`. Merging `main` is the Integrator's job (integrator.ts);
 * merging the knope release PR is a human's, always. `releaseEngineerMayMerge`
 * below exists only so that boundary has something concrete to test: it is
 * a function that can NEVER return `merge: true`, for any input — not a
 * conditional that happens to currently evaluate false.
 */

export const RELEASE_ENGINEER_ACTOR = 'release-engineer'

/** The branch name `knope prepare-release` opens its PR against, per
 *  `.github/workflows/knope-release-pr.yml`. Identifying the knope PR by
 *  its branch, rather than by title or label text, is the same reasoning
 *  as `PROTECTED_BRANCHES` in integrator.ts: a structural property of the
 *  PR the model cannot talk itself out of by phrasing something differently. */
export const KNOPE_RELEASE_BRANCH = 'release'

export interface PrIdentity {
  headRefName: string
  authorLogin: string
}

export function isKnopeReleasePr(pr: Pick<PrIdentity, 'headRefName'>): boolean {
  return pr.headRefName === KNOPE_RELEASE_BRANCH
}

export interface MergeDecision { merge: false; reason: string }

/**
 * Always refuses. There is deliberately no branch in this function that can
 * return `merge: true` — a mutation that flipped any literal `false` to
 * `true` anywhere in this file would be caught by a test asserting the
 * boolean itself, not by a test that merely checks a substring of the
 * reason text (see the effort-round warning about tests that measure the
 * wrong thing).
 */
export function releaseEngineerMayMerge(pr: PrIdentity): MergeDecision {
  if (isKnopeReleasePr(pr)) {
    return {
      merge: false,
      reason: 'the knope release PR is merged by a human only, after confirming main is green — never by the release engineer',
    }
  }
  if (pr.authorLogin === RELEASE_ENGINEER_ACTOR) {
    return {
      merge: false,
      reason: 'the release engineer never merges its own pull request — that is the Integrator role\'s job, or a human\'s',
    }
  }
  return {
    merge: false,
    reason: 'the release engineer never merges any pull request, under any circumstance — it has no merge capability at all',
  }
}

// ---------------------------------------------------------------------------
// Credential-free dispatch environment
// ---------------------------------------------------------------------------

/**
 * The exhaustive set of environment variables this role's dispatched worker
 * may see. Everything else in the operator's or CI's environment — every
 * store, signing, deploy, or telephony credential this fleet's `.env`
 * carries (Twilio, the Signal notifier bearer token, Postgres/RustFS
 * secrets, HMAC/session secrets, and every mobile signing credential that
 * lives only in CI or on the operator's own machine, never in this repo's
 * `.env` at all: App Store Connect API keys, the Android keystore and its
 * password, Tauri updater signing keys) — is simply never copied in. This
 * is an ALLOWLIST, not a denylist of known-bad names: a variable this list
 * does not name is absent from the dispatch environment by default,
 * regardless of what it is called.
 */
export const RELEASE_ENV_ALLOWLIST: readonly string[] = [
  'PATH',
  'HOME',
  'CI',
  'NODE_ENV',
  'BUN_INSTALL',
  'FLEET_HOME',
  'LANG',
  'LC_ALL',
  'TZ',
]

/**
 * A second, independent line of defense on top of the allowlist above:
 * even an entry that IS on `RELEASE_ENV_ALLOWLIST` is refused if its name
 * looks credential-shaped. This is the guard against the allowlist itself
 * ever drifting — a future edit that "helpfully" adds, say, `APPLE_API_KEY`
 * to the allowlist (because some pipeline step seemed to need it) trips
 * this pattern and fails loudly (`buildDispatchEnv` throws) rather than
 * quietly shipping a credential into a dispatched worker's environment.
 */
const CREDENTIAL_NAME_PATTERN =
  /KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|SIGNING|CERT|KEYSTORE|PFX|P12|P8|PROVISION|BEARER|AUTH\b|_SID$|DSN|_URL$|DATABASE/i

export function looksCredentialShaped(name: string): boolean {
  return CREDENTIAL_NAME_PATTERN.test(name)
}

/**
 * Builds the exact environment a release-engineer dispatch receives, from
 * the full process/operator environment. Only names in
 * `RELEASE_ENV_ALLOWLIST` are considered at all; each is additionally
 * checked against `looksCredentialShaped` and the whole call fails loudly
 * (throws) if the allowlist itself has been compromised, rather than
 * silently leaking the one entry through.
 */
export function buildDispatchEnv(
  fullEnv: NodeJS.ProcessEnv,
  allowlist: readonly string[] = RELEASE_ENV_ALLOWLIST,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of allowlist) {
    if (looksCredentialShaped(name)) {
      throw new Error(
        `refusing to build a release-engineer dispatch environment — the allowlist itself contains ` +
        `a credential-shaped entry ("${name}"); fix RELEASE_ENV_ALLOWLIST rather than dispatching`,
      )
    }
    const value = fullEnv[name]
    if (value !== undefined) out[name] = value
  }
  return out
}

// ---------------------------------------------------------------------------
// Pipelines, artifacts, and the honest report
// ---------------------------------------------------------------------------

export type ReleasePipeline = 'ios' | 'android' | 'desktop' | 'marketing-site'

export interface ArtifactCheck {
  path: string
  expectedSha256?: string
  actualSha256?: string
}

export interface ReleaseReport {
  pipeline: ReleasePipeline
  ranAt: number
  artifactsVerified: ArtifactCheck[]
  problems: string[]
  /**
   * A one-line ask for a human, present exactly when a human-only action is
   * on the critical path for this pipeline. `undefined` means nothing in
   * this run needed a human — never used to mean "forgot to check."
   */
  humanAsk?: string
}

/**
 * What a human, and only a human, must do to actually ship each pipeline.
 * This role can build, sign (where CI holds the key and runs the signing
 * step itself — this role never touches the key), checksum, and report; it
 * cannot press "Submit for Review" in App Store Connect, cannot approve a
 * Play Console rollout, cannot generate or rotate a signing key, cannot
 * provision a VPS, and cannot cut over DNS. Naming the exact action, per
 * pipeline, is what keeps this list honest instead of a vague "some human
 * step may be needed somewhere."
 */
const HUMAN_ONLY_ACTION: Readonly<Record<ReleasePipeline, string | undefined>> = {
  ios: 'Human needed: submit the verified build for review in App Store Connect — Apple Developer Program ' +
    'administration and release submission are not available to this role.',
  android: 'Human needed: promote the verified build in Play Console and set its rollout percentage — ' +
    'store submission is not available to this role.',
  desktop: undefined,
  'marketing-site': undefined,
}

export function humanAskFor(pipeline: ReleasePipeline): string | undefined {
  return HUMAN_ONLY_ACTION[pipeline]
}

export function buildReleaseReport(input: {
  pipeline: ReleasePipeline
  artifactsVerified: ArtifactCheck[]
  problems: string[]
  now?: number
}): ReleaseReport {
  const humanAsk = humanAskFor(input.pipeline)
  return {
    pipeline: input.pipeline,
    ranAt: input.now ?? Date.now(),
    artifactsVerified: input.artifactsVerified,
    problems: input.problems,
    ...(humanAsk !== undefined ? { humanAsk } : {}),
  }
}
