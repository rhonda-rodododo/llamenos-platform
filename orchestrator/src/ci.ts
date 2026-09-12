import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Lane } from './config.js'
import type { VerifyInput, VerifyReport } from './verify.js'
import type { SecondOpinionInput, SecondOpinionResult } from './review.js'
import { buildGateTrace } from './trace.js'

const execFileAsync = promisify(execFile)

/**
 * The fleet's gates, expressed as the only thing GitHub actually enforces:
 * two CI jobs named `fleet/verify` and `fleet/review`, required by the repo
 * ruleset. Both run their full logic on EVERY pull request, on GitHub's
 * runners, against the PR's head commit — never on the operator's laptop
 * before the PR exists, and with no branch-name opt-out. The previous design decided
 * "may this merge?" in-process and then ran the merge itself; GitHub knew
 * nothing about it, so anyone could merge a fleet PR on the repo's own CI
 * alone, which is what happened to the fleet's first live PR (#662).
 *
 * Nothing here posts a commit status. An Actions job already IS a check run
 * named after the job, and that name is what the ruleset requires — posting a
 * same-named status on top would be a second copy of the same verdict, and
 * the `statuses: write` permission it needed is exactly what makes fork PRs
 * unmergeable. These functions return a verdict; the CLI turns it into an
 * exit code and prints the reason. Red job, red check, one fact.
 *
 * Check runs are per-commit, so the verified-commit pin the old merge path
 * enforced with a gh flag comes free: a push moves the head, and the new head
 * has no green check of its own. Fail-closed by construction — a job that
 * does not run leaves its required check missing, and the merge is blocked.
 */
export const VERIFY_JOB = 'fleet/verify'
export const REVIEW_JOB = 'fleet/review'

/**
 * A PR whose branch is not `fleet/<lane>/<item>` has no lane, so there is no
 * owned-path scope to hold it to — but NEVER-WRITE still binds everyone (no
 * PR may add a secret), and the non-author review still runs. `checkScope`
 * gives exactly that for an empty `owned` list, which is the same rail
 * guards.test.ts already asserts ("never-write binds even an unrestricted
 * lane").
 *
 * There is deliberately no opt-out and no discriminator. An earlier revision
 * passed non-fleet branches trivially, which was wrong twice over: the user's
 * policy is green CI plus a non-author review for ALL work, and author login
 * could not have distinguished the two anyway — the fleet pushes with the
 * operator's own GitHub account.
 */
export const UNSCOPED_LANE: Lane = {
  id: '(no lane — not a fleet branch)',
  mode: 'off',
  cap: 0,
  // The fleet's workers are `claude`, so this keeps the reviewer on the other
  // engine for a human PR too — `verifierFor` is what makes the review
  // non-author, and it must not quietly become same-engine here.
  engine: 'claude',
  requireLabel: '',
  vetoLabels: [],
  scope: { owned: [], notOwned: [] },
}

/** The CI secret carrying the non-author reviewer's provider key. Absent
 *  FAILS the job — never skips, never passes: a review that could not run is
 *  not a review that passed. */
export const REVIEW_KEY_ENV = 'FLEET_REVIEW_API_KEY'

/** `ok` becomes the job's exit code; `summary` is printed, and is the whole
 *  reason a reader needs for why the job is the colour it is. */
export interface CiVerdict { ok: boolean; summary: string }

/**
 * `realDispatch` (cli.ts) builds every fleet branch as `fleet/<lane>/<item>`.
 * ONE regex for that grammar, used by everything that reads a fleet branch —
 * deriving the lane (CI, to load its real scope) and the item (cli.ts, to
 * link the PR to its issue) from the branch NAME rather than from a label, a
 * ledger row, or a worker's own status report, which is the only source that
 * is both authoritative and available with no state of its own.
 */
const FLEET_BRANCH_RE = /^fleet\/([^/]+)\/([^/]+)$/

export function laneIdFromBranch(branch: string): string | undefined {
  return FLEET_BRANCH_RE.exec(branch)?.[1]
}

export function itemIdFromBranch(branch: string): string | undefined {
  return FLEET_BRANCH_RE.exec(branch)?.[2]
}

/** The reviewer's own `VERDICT: PASS|FAIL` line if it wrote one, else its
 *  first non-empty line — never an invented summary. */
export function verdictSummary(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  return lines.find((l) => /verdict:/i.test(l)) ?? lines[0] ?? '(no reviewer output)'
}

export interface CiContext {
  /** The PR's HEAD branch name — `github.head_ref` on a pull_request event.
   *  Used only to derive the lane; the diff is always taken against `HEAD`,
   *  since CI checks the head commit out detached. */
  branch: string
  worktree: string
  /** For the reviewer's prompt only. */
  pr: string
}

export interface VerifyCiDeps {
  ctx: CiContext
  lanes(): Promise<Lane[]>
  verify(input: VerifyInput): Promise<VerifyReport>
}

export interface ReviewCiDeps {
  ctx: CiContext
  /** `undefined`/empty when the repo secret is not configured. */
  apiKey: string | undefined
  lanes(): Promise<Lane[]>
  verify(input: VerifyInput): Promise<VerifyReport>
  prDiff(): Promise<string>
  secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult>
}

/** CI checks the head commit out detached, so the branch NAME is not a local
 *  ref — `HEAD` is, and it is the commit the check run attaches to. */
const CI_DIFF_REF = 'HEAD'

/**
 * `undefined` ONLY when the branch parses as a fleet branch but names a lane
 * that does not exist — a real misconfiguration that must fail, not be
 * quietly downgraded to the unscoped check. A branch that is not a fleet
 * branch at all resolves to `UNSCOPED_LANE` and is verified like anything
 * else.
 */
async function resolveLane(deps: VerifyCiDeps | ReviewCiDeps): Promise<Lane | undefined> {
  const laneId = laneIdFromBranch(deps.ctx.branch)
  if (laneId === undefined) return UNSCOPED_LANE
  return (await deps.lanes()).find((l) => l.id === laneId)
}

/** `fleet/verify` — scope, impact, and diff-targeted tests against
 *  `origin/main...HEAD`. */
export async function runVerifyCi(deps: VerifyCiDeps): Promise<CiVerdict> {
  const lane = await resolveLane(deps)
  if (lane === undefined) return { ok: false, summary: `unknown lane in branch ${deps.ctx.branch}` }

  const report = await deps.verify({ worktree: deps.ctx.worktree, branch: CI_DIFF_REF, lane })
  return {
    ok: report.passed,
    summary: [buildGateTrace({ report }), ...report.reasons.map((r) => `- ${r}`)].join('\n'),
  }
}

/**
 * `fleet/review` — the non-author model's verdict on EVERY pull request,
 * produced on the runner against the exact head commit by an engine that is
 * not the one that wrote the diff (`secondOpinion` picks it, and hands it a
 * `.git`-less snapshot).
 *
 * Scope is re-checked but tests are NOT re-run: `fleet/verify` runs them, and
 * twice doubles every fleet PR's CI cost for no extra signal. The scope
 * re-check is the invariant `secondOpinion` already enforces by throwing — a
 * review may only downgrade a mechanical pass, never rescue a failure — so a
 * diff that failed scope gets no review at all.
 */
export async function runReviewCi(deps: ReviewCiDeps): Promise<CiVerdict> {
  if (deps.apiKey === undefined || deps.apiKey.length === 0) {
    return { ok: false, summary: `review unavailable: ${REVIEW_KEY_ENV} is not configured on this repository` }
  }
  const lane = await resolveLane(deps)
  if (lane === undefined) return { ok: false, summary: `unknown lane in branch ${deps.ctx.branch}` }

  const report = await deps.verify({ worktree: deps.ctx.worktree, branch: CI_DIFF_REF, lane, skipTests: true })
  if (!report.passed) {
    return {
      ok: false,
      summary: `no review requested: ${report.reasons.join('; ') || 'mechanical verification failed'}`,
    }
  }

  let result: SecondOpinionResult
  try {
    const diff = await deps.prDiff()
    result = await deps.secondOpinion({
      authorEngine: lane.engine, pr: deps.ctx.pr, worktree: deps.ctx.worktree, diff, report,
    })
  } catch (e) {
    return { ok: false, summary: `review unavailable: ${e instanceof Error ? e.message : String(e)}` }
  }

  // UNREADABLE and FAIL both fail the job, but they are different facts and
  // the summary says which: "the reviewer could not be run" is not "the
  // reviewer found a problem".
  const summary = result.verdict === 'UNREADABLE'
    ? `review unavailable: ${verdictSummary(result.text)}`
    : verdictSummary(result.text)
  return { ok: result.verdict === 'PASS', summary: `${summary}\n\n${result.text}` }
}

/** `undefined` when the workflow did not supply a branch — a CI entry point
 *  with no idea what it is judging must refuse, not guess. */
export function ciContextFromEnv(env: NodeJS.ProcessEnv, worktree: string): CiContext | undefined {
  const branch = env['FLEET_CI_BRANCH'] ?? ''
  if (branch.length === 0) return undefined
  return { branch, worktree, pr: env['FLEET_CI_PR'] ?? '(unknown)' }
}

export async function ciDiff(worktree: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', worktree, 'diff', `origin/main...${CI_DIFF_REF}`],
    { maxBuffer: 32 * 1024 * 1024 })
  return stdout
}
