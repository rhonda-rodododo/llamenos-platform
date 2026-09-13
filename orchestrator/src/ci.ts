import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Lane } from './config.js'
import type { VerifyInput, VerifyReport } from './verify.js'
import type { SecondOpinionInput, SecondOpinionResult } from './review.js'
import { join } from 'node:path'
import { buildGateTrace } from './trace.js'

const execFileAsync = promisify(execFile)

/**
 * The fleet's gates, expressed as the only thing GitHub can actually enforce:
 * two CI jobs named `fleet/verify` and `fleet/review`. Both run their full
 * logic on EVERY pull request, on GitHub's runners, against the PR's head
 * commit — never on the operator's laptop before the PR exists, and with no
 * branch-name opt-out.
 *
 * The migration is complete as of this commit: the ruleset requires both
 * checks, and `merge.ts`'s in-process gate — which nothing outside this
 * process was ever bound by — is deleted. What stops a merge now is GitHub. The previous design decided
 * "may this merge?" in-process and then ran the merge itself; GitHub knew
 * nothing about it, so anyone could merge a fleet PR on the repo's own CI
 * alone, which is what happened to the fleet's first live PR (#662).
 *
 * THE INVARIANT, and the reason this round exists: **the gate never executes
 * code from the commit it judges — it reads it.** The jobs check out the
 * PR's BASE commit, install from the BASE lockfile with `--ignore-scripts`,
 * and run this orchestrator from that trusted tree. The head commit is
 * fetched as an object and extracted with `git archive | tar` into a
 * directory with no `.git` — files, never a checkout, never a module path.
 *
 * The first version of this design checked out the head and ran
 * `bun install` plus the CLI from it. A PR editing `package.json` (an
 * install script) or `bun.lockb` (a postinstall) therefore got arbitrary
 * execution inside both gate jobs BEFORE any verdict was computed — enough
 * to force exit 0 on both and to read the review key out of the runner's
 * HOME. Neither file was code-owned, so no human would have seen it. The
 * judge was running the defendant's code; `fleet/review` itself caught it.
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
  /** The PR's HEAD branch name — `github.head_ref`. Used only to derive the
   *  lane; it is a NAME, never something that gets checked out. */
  branch: string
  /** The BASE checkout: trusted git history, trusted orchestrator code,
   *  trusted `node_modules`. Every decision is computed from here. */
  repoDir: string
  /** `git archive <headSha> | tar -x` of the commit under judgement — its
   *  files, with no `.git` and nothing executed. */
  headDir: string
  /** LHS of the diff range: the commit the PR is based on. */
  baseSha: string
  /** RHS of the diff range: the commit under judgement, fetched into the
   *  base checkout as an object. */
  headSha: string
  /** For the reviewer's prompt only. */
  pr: string
}

export interface CiDeps {
  ctx: CiContext
  lanes(): Promise<Lane[]>
  verify(input: VerifyInput): Promise<VerifyReport>
  /** Injected so the export-not-a-checkout invariant below is testable
   *  without a filesystem. */
  pathExists(p: string): boolean
  /** The job log — the durable record of what the gate saw. */
  log(msg: string): void
}

export type VerifyCiDeps = CiDeps

export interface ReviewCiDeps extends CiDeps {
  /** `undefined`/empty when the repo secret is not configured. */
  apiKey: string | undefined
  prDiff(): Promise<string>
  secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult>
}

/**
 * `undefined` ONLY when the branch parses as a fleet branch but names a lane
 * that does not exist — a real misconfiguration that must fail, not be
 * quietly downgraded to the unscoped check. A branch that is not a fleet
 * branch at all resolves to `UNSCOPED_LANE` and is verified like anything
 * else.
 */
async function resolveLane(deps: CiDeps): Promise<Lane | undefined> {
  const laneId = laneIdFromBranch(deps.ctx.branch)
  if (laneId === undefined) return UNSCOPED_LANE
  return (await deps.lanes()).find((l) => l.id === laneId)
}

/**
 * Asserted, never assumed. A `.git` inside the head directory means someone
 * changed the workflow to CHECK OUT the commit under judgement instead of
 * exporting it — restoring exactly the hole this design closed, silently and
 * with both jobs still green. Refusing here makes that edit fail loudly on
 * its own PR.
 */
function headDirRefusal(deps: CiDeps): CiVerdict | undefined {
  if (!deps.pathExists(join(deps.ctx.headDir, '.git'))) return undefined
  return {
    ok: false,
    summary: `refusing to judge: ${deps.ctx.headDir} contains a .git — the commit under ` +
      'judgement must be exported as data (git archive), never checked out',
  }
}

/** The diff range, taken entirely inside the trusted base checkout. */
function rangeFor(ctx: CiContext): Pick<VerifyInput, 'worktree' | 'base' | 'branch'> {
  return { worktree: ctx.repoDir, base: ctx.baseSha, branch: ctx.headSha }
}

/** `fleet/verify` — scope, impact, and diff-targeted tests against
 *  `origin/main...HEAD`. */
export async function runVerifyCi(deps: VerifyCiDeps): Promise<CiVerdict> {
  const refusal = headDirRefusal(deps)
  if (refusal !== undefined) return refusal

  const lane = await resolveLane(deps)
  if (lane === undefined) return { ok: false, summary: `unknown lane in branch ${deps.ctx.branch}` }

  // PHASE 1 — trusted only. git runs in the base checkout; scope, never-write
  // and impact are pure functions over the file list it returns. No code from
  // the commit under judgement has executed, or can, at this point.
  const gate = await deps.verify({ ...rangeFor(deps.ctx), lane, skipTests: true })
  deps.log(`gate (no code from the commit under judgement executed): ${buildGateTrace({ report: gate })}`)
  if (!gate.passed) {
    return {
      ok: false,
      summary: [buildGateTrace({ report: gate }), ...gate.reasons.map((r) => `- ${r}`)].join('\n'),
    }
  }

  // PHASE 2 — the ONLY place the judged commit's code runs, and running it is
  // unavoidable: these are its own tests. It happens AFTER the verdict above
  // was computed and printed, in a separate process, against the export — so
  // it can only AND into the result, never revise it. This job holds no
  // secrets for that code to reach.
  const withTests = await deps.verify({ ...rangeFor(deps.ctx), lane, testDir: deps.ctx.headDir })
  return {
    ok: withTests.passed,
    summary: [buildGateTrace({ report: withTests }), ...withTests.reasons.map((r) => `- ${r}`)].join('\n'),
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
  const refusal = headDirRefusal(deps)
  if (refusal !== undefined) return refusal

  if (deps.apiKey === undefined || deps.apiKey.length === 0) {
    return { ok: false, summary: `review unavailable: ${REVIEW_KEY_ENV} is not configured on this repository` }
  }
  const lane = await resolveLane(deps)
  if (lane === undefined) return { ok: false, summary: `unknown lane in branch ${deps.ctx.branch}` }

  const report = await deps.verify({ ...rangeFor(deps.ctx), lane, skipTests: true })
  if (!report.passed) {
    return {
      ok: false,
      summary: `no review requested: ${report.reasons.join('; ') || 'mechanical verification failed'}`,
    }
  }

  let result: SecondOpinionResult
  try {
    const diff = await deps.prDiff()
    // `snapshotDir`, never `worktree`: the export already exists, so this
    // job runs no git and creates nothing. Zero execution of the judged
    // commit's code anywhere in this job — which is what lets it hold the key.
    result = await deps.secondOpinion({
      authorEngine: lane.engine, pr: deps.ctx.pr, snapshotDir: deps.ctx.headDir, diff, report,
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
export function ciContextFromEnv(env: NodeJS.ProcessEnv, repoDir: string): CiContext | undefined {
  const branch = env['FLEET_CI_BRANCH'] ?? ''
  const headDir = env['FLEET_CI_HEAD_DIR'] ?? ''
  const headSha = env['FLEET_CI_HEAD_SHA'] ?? ''
  const baseSha = env['FLEET_CI_BASE_SHA'] ?? ''
  if (branch.length === 0 || headDir.length === 0 || headSha.length === 0 || baseSha.length === 0) return undefined
  return { branch, repoDir, headDir, headSha, baseSha, pr: env['FLEET_CI_PR'] ?? '(unknown)' }
}

/** Read inside the trusted base checkout, over the fetched head object. */
export async function ciDiff(ctx: CiContext): Promise<string> {
  const { stdout } = await execFileAsync(
    'git', ['-C', ctx.repoDir, 'diff', `${ctx.baseSha}...${ctx.headSha}`],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  return stdout
}
