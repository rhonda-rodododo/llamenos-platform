import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gh, REPO } from './gh.js'
import type { Lane } from './config.js'
import type { VerifyInput, VerifyReport } from './verify.js'
import type { SecondOpinionInput, SecondOpinionResult } from './review.js'
import { buildGateTrace } from './trace.js'

const execFileAsync = promisify(execFile)

/**
 * The fleet's gates, expressed as the only thing GitHub actually enforces:
 * commit statuses on the PR's head SHA, required by the repo ruleset. Both
 * are computed HERE, in CI, on GitHub's runners — never on the operator's
 * laptop before the PR exists. The previous design decided "may this merge?"
 * in-process and then ran the merge itself; GitHub knew nothing about it, so
 * anyone could merge a fleet PR on the repo's own CI alone — which is exactly
 * what happened to the fleet's first live PR (#662).
 *
 * Statuses are per-SHA, so the verified-commit pin the old merge path
 * enforced with a gh flag comes free: a push moves the head, and the new head
 * carries no green status of its own. Fail-closed by construction — if a job
 * does not run, its required status is MISSING and the merge is blocked.
 * Nothing here has to remember to say "no".
 */
export const VERIFY_CONTEXT = 'fleet/verify'
export const REVIEW_CONTEXT = 'fleet/review'

export type StatusState = 'success' | 'failure' | 'error'

/**
 * Required status checks apply to EVERY pull request, not only the fleet's,
 * so a PR from a human branch has to satisfy them trivially or the repo
 * deadlocks. `success` with this description is that trivial satisfaction —
 * and it says so in the PR UI rather than pretending a gate ran.
 */
export const NOT_A_FLEET_PR = 'not a fleet PR'

/** The CI secret carrying the non-author reviewer's provider key. Absent is
 *  an ERROR status, never a skip and never a pass: a review that could not
 *  run is not a review that passed. */
export const REVIEW_KEY_ENV = 'FLEET_REVIEW_API_KEY'

/** GitHub silently truncates a commit status description past 140 chars, so
 *  it is truncated here instead — visibly, with an ellipsis. The full trace
 *  and the reviewer's full text go to the job log. */
export const DESCRIPTION_MAX = 140

export function shortDescription(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim()
  if (one.length === 0) return '(no detail)'
  return one.length <= DESCRIPTION_MAX ? one : `${one.slice(0, DESCRIPTION_MAX - 1)}…`
}

/** `realDispatch` (cli.ts) builds every fleet branch as `fleet/<lane>/<item>`.
 *  Deriving the lane from the branch — not from a label or a ledger row —
 *  is what lets CI load the lane's real scope with no state of its own. */
export function laneIdFromBranch(branch: string): string | undefined {
  return /^fleet\/([^/]+)\/[^/]+$/.exec(branch)?.[1]
}

/** The reviewer's own `VERDICT: PASS|FAIL` line if it wrote one, else its
 *  first non-empty line — never an invented summary. */
export function verdictSummary(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  return lines.find((l) => /verdict:/i.test(l)) ?? lines[0] ?? '(no reviewer output)'
}

export interface CiContext {
  /** The PR's HEAD branch name — `github.head_ref` on a pull_request event.
   *  Used only to derive the lane; the diff itself is always taken against
   *  `HEAD`, since CI checks the head SHA out detached. */
  branch: string
  /** The PR's head commit — `github.event.pull_request.head.sha`, NOT
   *  `github.sha` (which is the throwaway merge commit on a PR event). The
   *  status must land on the commit the ruleset will check. */
  sha: string
  worktree: string
  /** For the reviewer's prompt only. */
  pr: string
}

export interface StatusDeps {
  postStatus(context: string, state: StatusState, description: string): Promise<void>
  log(msg: string): void
}

export interface VerifyCiDeps extends StatusDeps {
  ctx: CiContext
  lanes(): Promise<Lane[]>
  verify(input: VerifyInput): Promise<VerifyReport>
}

export interface ReviewCiDeps extends StatusDeps {
  ctx: CiContext
  /** `undefined`/empty when the repo secret is not configured. */
  apiKey: string | undefined
  lanes(): Promise<Lane[]>
  verify(input: VerifyInput): Promise<VerifyReport>
  prDiff(): Promise<string>
  secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult>
}

/** CI checks the head SHA out detached, so the branch NAME is not a local
 *  ref — `HEAD` is, and it is exactly the commit the status is posted on. */
const CI_DIFF_REF = 'HEAD'

async function laneFor(
  deps: VerifyCiDeps | ReviewCiDeps, context: string, laneId: string,
): Promise<Lane | undefined> {
  const lane = (await deps.lanes()).find((l) => l.id === laneId)
  if (lane === undefined) {
    await deps.postStatus(context, 'failure', `unknown lane "${laneId}" in branch ${deps.ctx.branch}`)
  }
  return lane
}

/** `fleet/verify` — scope, impact, and diff-targeted tests against
 *  `origin/main...HEAD`. Exits non-zero on a failing verdict so the job is red
 *  too: not a green job hiding a red status. */
export async function runVerifyCi(deps: VerifyCiDeps): Promise<number> {
  const laneId = laneIdFromBranch(deps.ctx.branch)
  if (laneId === undefined) {
    await deps.postStatus(VERIFY_CONTEXT, 'success', NOT_A_FLEET_PR)
    return 0
  }
  const lane = await laneFor(deps, VERIFY_CONTEXT, laneId)
  if (lane === undefined) return 1

  const report = await deps.verify({ worktree: deps.ctx.worktree, branch: CI_DIFF_REF, lane })
  const trace = buildGateTrace({ report })
  deps.log([trace, ...report.reasons.map((r) => `- ${r}`)].join('\n'))
  await deps.postStatus(VERIFY_CONTEXT, report.passed ? 'success' : 'failure', trace)
  return report.passed ? 0 : 1
}

/**
 * `fleet/review` — the non-author model's verdict, produced on the runner
 * against the exact head SHA by an engine that is not the one that wrote the
 * diff (`secondOpinion` picks it, and hands it a `.git`-less snapshot).
 *
 * Scope is re-checked but tests are NOT re-run: `fleet/verify` runs them, and
 * twice doubles every fleet PR's CI cost for no extra signal. The scope
 * re-check is the invariant `secondOpinion` already enforces by throwing — a
 * review may only downgrade a mechanical pass, never rescue a failure — so a
 * diff that failed scope gets no review at all.
 */
export async function runReviewCi(deps: ReviewCiDeps): Promise<number> {
  const laneId = laneIdFromBranch(deps.ctx.branch)
  if (laneId === undefined) {
    await deps.postStatus(REVIEW_CONTEXT, 'success', NOT_A_FLEET_PR)
    return 0
  }
  if (deps.apiKey === undefined || deps.apiKey.length === 0) {
    await deps.postStatus(REVIEW_CONTEXT, 'error',
      `review unavailable: ${REVIEW_KEY_ENV} is not configured on this repository`)
    return 1
  }
  const lane = await laneFor(deps, REVIEW_CONTEXT, laneId)
  if (lane === undefined) return 1

  const report = await deps.verify({ worktree: deps.ctx.worktree, branch: CI_DIFF_REF, lane, skipTests: true })
  if (!report.passed) {
    await deps.postStatus(REVIEW_CONTEXT, 'failure',
      `no review requested: ${report.reasons.join('; ') || 'mechanical verification failed'}`)
    return 1
  }

  let result: SecondOpinionResult
  try {
    const diff = await deps.prDiff()
    result = await deps.secondOpinion({
      authorEngine: lane.engine, pr: deps.ctx.pr, worktree: deps.ctx.worktree, diff, report,
    })
  } catch (e) {
    await deps.postStatus(REVIEW_CONTEXT, 'error',
      `review unavailable: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  deps.log(result.text)
  if (result.verdict === 'UNREADABLE') {
    await deps.postStatus(REVIEW_CONTEXT, 'error', `review unavailable: ${verdictSummary(result.text)}`)
    return 1
  }
  await deps.postStatus(REVIEW_CONTEXT, result.verdict === 'PASS' ? 'success' : 'failure', verdictSummary(result.text))
  return result.verdict === 'PASS' ? 0 : 1
}

/** `gh api` takes its repo inside the path and rejects `-R`, which is why
 *  `ghArgs` (gh.ts) exempts it. `-X POST` is explicit, not inferred from `-f`. */
export async function postCommitStatus(
  sha: string, context: string, state: StatusState, description: string,
): Promise<void> {
  await gh(['api', '-X', 'POST', `repos/${REPO}/statuses/${sha}`,
    '-f', `state=${state}`, '-f', `context=${context}`, '-f', `description=${shortDescription(description)}`])
}

/** `undefined` when the workflow did not supply a branch and head SHA — a
 *  CI entry point with no idea which commit it is judging must refuse to
 *  post anything, not guess. */
export function ciContextFromEnv(env: NodeJS.ProcessEnv, worktree: string): CiContext | undefined {
  const branch = env['FLEET_CI_BRANCH'] ?? ''
  const sha = env['FLEET_CI_SHA'] ?? ''
  if (branch.length === 0 || sha.length === 0) return undefined
  return { branch, sha, worktree, pr: env['FLEET_CI_PR'] ?? '(unknown)' }
}

export async function ciDiff(worktree: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', worktree, 'diff', `origin/main...${CI_DIFF_REF}`],
    { maxBuffer: 32 * 1024 * 1024 })
  return stdout
}
