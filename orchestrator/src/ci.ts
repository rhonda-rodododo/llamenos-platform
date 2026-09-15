import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import type { Lane } from './config.js'
import type { VerifyInput, VerifyReport } from './verify.js'
import { finalLine, type SecondOpinionInput, type SecondOpinionResult } from './review.js'
import { join } from 'node:path'
import { buildGateTrace } from './trace.js'
import { REPO, gh, ghJson } from './gh.js'

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

/**
 * The one WRITER of that grammar, next to the one reader. `buildArgs`
 * (engines.ts) passes this to `dispatch-one.sh --branch`, and `realDispatch`
 * (cli.ts) verifies the worktree and PR head against it — neither may spell
 * the format out itself. Issue #812: the dispatcher used to name the branch
 * after the worker (`fleet-shared-704`), which this regex does not
 * recognise, so the fleet skipped verify/review for the PR and CI treated it
 * as a non-fleet branch with no lane scope.
 *
 * Throws rather than returning a branch its own reader would reject: a lane
 * or item id containing `/` (or an empty one) would otherwise produce a
 * branch every consumer above treats as "not a fleet branch".
 */
export function fleetBranchFor(laneId: string, itemId: string): string {
  const branch = `fleet/${laneId}/${itemId}`
  if (laneIdFromBranch(branch) !== laneId || itemIdFromBranch(branch) !== itemId) {
    throw new Error(`lane "${laneId}" / item "${itemId}" cannot form a fleet branch (fleet/<lane>/<item>)`)
  }
  return branch
}

export function laneIdFromBranch(branch: string): string | undefined {
  return FLEET_BRANCH_RE.exec(branch)?.[1]
}

export function itemIdFromBranch(branch: string): string | undefined {
  return FLEET_BRANCH_RE.exec(branch)?.[2]
}

/** The one line `parseVerdict` judged — the reviewer's final non-empty line,
 *  selected by the same function (`finalLine`), so the printed summary and the
 *  job's exit code can never name different verdicts. Never an invented
 *  summary and never a search of its own. */
export function verdictSummary(text: string): string {
  return finalLine(text) ?? '(no reviewer output)'
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

/**
 * A previously-recorded `fleet/review` verdict for THIS pull request, found
 * by `ReviewCiDeps.findCachedReview` under an exact content-key match. Carries
 * `verdict` rather than being PASS-only so the fail-safe rule below — a
 * cached FAIL is never reused — lives in `runReviewCi`, next to its own test,
 * instead of inside an untested `gh`-calling implementation.
 */
export interface CachedReviewVerdict {
  /** The commit whose `fleet/review` run produced this verdict. */
  sha: string
  verdict: 'PASS' | 'FAIL'
  text: string
}

export interface ReviewCiDeps extends CiDeps {
  /** `undefined`/empty when the repo secret is not configured. */
  apiKey: string | undefined
  prDiff(): Promise<string>
  secondOpinion(input: SecondOpinionInput): Promise<SecondOpinionResult>
  /**
   * The content key for this diff: sha256 of the merge-base sha and the diff
   * TEXT (see `reviewKeyFor`) — never the head sha. A merge-from-main moves
   * the head sha on every push without changing what the PR proposes; keying
   * on the head sha would mean this cache never hits the case it exists for.
   */
  reviewKey(diff: string): Promise<string>
  /**
   * Looks up whatever `fleet/review` verdict was most recently recorded for
   * THIS pull request under the given content key — never another PR's,
   * never another base branch's: the search space this function is given is
   * this one PR's own commit/check-run history and nothing else.
   *
   * May throw. `runReviewCi` treats a throw exactly like "nothing found":
   * fail SAFE, not fail cheap — a lookup that could not be completed must
   * never be read as "no prior review exists" in the sense of skipping the
   * engine, it must read as "run the engine, same as always".
   */
  findCachedReview(key: string): Promise<CachedReviewVerdict | undefined>
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
    summary: [
      buildGateTrace({ report: withTests }),
      ...(withTests.testResults ?? []).map((r) => `- ${r}`),
      ...withTests.reasons.map((r) => `- ${r}`),
    ].join('\n'),
  }
}

/**
 * Fail-safe wrapper around `deps.findCachedReview`: a lookup that throws, or
 * that finds nothing, or that finds a prior FAIL for this exact key, is
 * treated identically — never reused, always fall through to the engine. A
 * cached FAIL must be re-earned after any push; it is a fact about the OLD
 * content, and the whole point of keying on content rather than the head sha
 * is that a push which changed nothing about the diff should not have to
 * re-earn a PASS, but a push that is under review because something DID need
 * fixing gets no such shortcut.
 */
async function findReusableVerdict(deps: ReviewCiDeps, key: string): Promise<CachedReviewVerdict | undefined> {
  let found: CachedReviewVerdict | undefined
  try {
    found = await deps.findCachedReview(key)
  } catch (e) {
    deps.log(`review-key=${key}: cache lookup failed, running the engine: ${e instanceof Error ? e.message : String(e)}`)
    return undefined
  }
  if (found === undefined) return undefined
  if (found.verdict !== 'PASS') {
    deps.log(`review-key=${key} was last recorded FAIL at ${found.sha} — a FAIL is never reused, running the engine`)
    return undefined
  }
  return found
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
 *
 * Before invoking the engine at all, a content key is computed from the diff
 * (`deps.reviewKey`) and checked against this PR's own prior `fleet/review`
 * history (`deps.findCachedReview`, wrapped by `findReusableVerdict`). A hit
 * republishes the earlier PASS verbatim and never calls `secondOpinion` —
 * see the module-level comment block for why this exists (#812-class
 * quota incident: a merge-from-main re-reviews an unchanged diff).
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

  let diff: string
  try {
    diff = await deps.prDiff()
  } catch (e) {
    return { ok: false, summary: `review unavailable: ${e instanceof Error ? e.message : String(e)}` }
  }

  // The content key is computed from the diff itself (see reviewKeyFor), not
  // from ctx.headSha — a merge-from-main changes the head sha on every push
  // without changing a single byte of what the PR proposes, which is exactly
  // the case this cache exists to skip.
  const key = await deps.reviewKey(diff)
  deps.log(`review-key=${key}`)

  const cached = await findReusableVerdict(deps, key)
  if (cached !== undefined) {
    const line = `reused verdict for review-key=${key} from ${cached.sha}`
    deps.log(line)
    return { ok: true, summary: `${line}\n\n${cached.text}` }
  }

  let result: SecondOpinionResult
  try {
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

// ---------------------------------------------------------------------------
// review-key content cache (#812-class incident: every push re-reviewed an
// identical diff and burned the whole week's provider quota on it)
// ---------------------------------------------------------------------------

/**
 * `git diff <base>...<head>` (triple-dot) already computes the merge-base
 * itself, but that merge-base is never surfaced by `ciDiff` — it is
 * recomputed here, independently, as an explicit second input to the key.
 * Belt and suspenders: the diff TEXT already reflects the merge-base
 * (`git diff --no-color base...head`'s content changes if the merge-base
 * moves), so this cannot silently drift out of step with it, but a key
 * computed from diff text alone would make it easy for a future edit to
 * accidentally key on something that is not actually anchored to the diff
 * (e.g. re-adding a head-sha shortcut) without a test noticing — see the two
 * `reviewKeyFor` tests that hold both inputs load-bearing.
 */
export async function ciMergeBase(ctx: CiContext): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', ctx.repoDir, 'merge-base', ctx.baseSha, ctx.headSha])
  return stdout.trim()
}

/**
 * The content key: sha256 of the merge-base sha and the diff text, NEVER the
 * head sha. Pure and synchronous so it is exhaustively testable on its own —
 * `runReviewCi`'s own review-key handling only ever calls this indirectly,
 * through `ReviewCiDeps.reviewKey`, which is what lets tests there inject an
 * arbitrary key without touching git or the hash algorithm at all.
 */
export function reviewKeyFor(mergeBase: string, diff: string): string {
  return createHash('sha256').update(`${mergeBase}\n${diff}`).digest('hex')
}

/** The real `ReviewCiDeps.reviewKey` implementation cli.ts wires in. */
export async function ciReviewKey(ctx: CiContext, diff: string): Promise<string> {
  return reviewKeyFor(await ciMergeBase(ctx), diff)
}

const LOG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /
const REVIEW_KEY_LINE_RE = /^review-key=([0-9a-f]{64})$/

/**
 * Reconstructs `runReviewCi`'s own printed output from a raw GitHub Actions
 * job log (`gh api .../actions/jobs/<id>/logs`) — every line of which the
 * runner prefixes with its own ISO timestamp, even lines that were part of
 * the SAME multi-line `process.stdout.write` call in `ciLog`/`runCiGate`.
 *
 * Looks for the STANDALONE `review-key=<hex>` line `runReviewCi` writes via
 * `deps.log` before it does anything else with the key — never the
 * `fleet/review: PASS — …` line, which only ever *might* also contain the
 * substring `review-key=` (it does not, by construction, but nothing should
 * rely on that construction holding forever). `undefined` when no such line
 * exists at all: an older run, from before this cache existed, or a run that
 * crashed before reaching that print — both correctly read as "no usable key
 * recorded here" by the caller.
 */
export function extractLoggedReviewKey(logText: string): { key: string; summary: string } | undefined {
  const lines = logText.split('\n').map((l) => l.replace(LOG_TIMESTAMP_RE, ''))
  const keyIdx = lines.findIndex((l) => REVIEW_KEY_LINE_RE.test(l))
  if (keyIdx === -1) return undefined
  const key = REVIEW_KEY_LINE_RE.exec(lines[keyIdx] as string)?.[1] as string
  const jobLinePrefix = `${REVIEW_JOB}: `
  const jobLineIdx = lines.findIndex((l, i) => i > keyIdx && l.startsWith(jobLinePrefix))
  const summary = jobLineIdx === -1 ? '' : lines.slice(jobLineIdx).join('\n').slice(jobLinePrefix.length)
  return { key, summary }
}

interface GhCheckRunsResponse {
  check_runs: { id: number; status: string; conclusion: string | null }[]
}

/** Every commit this PR has ever had as its head, most recent first — most
 *  pushes are a merge-from-main or an amend that never earns its own
 *  `fleet/review` run, so searching newest-first finds a real match fastest. */
async function prCommitShasNewestFirst(pr: string): Promise<string[]> {
  const commits = await ghJson<{ sha: string }[]>(['api', `repos/${REPO}/pulls/${pr}/commits`, '--paginate'])
  return (commits ?? []).map((c) => c.sha).reverse()
}

async function fleetReviewCheckRunsFor(sha: string): Promise<GhCheckRunsResponse['check_runs']> {
  const res = await ghJson<GhCheckRunsResponse>([
    'api', `repos/${REPO}/commits/${sha}/check-runs?check_name=${encodeURIComponent(REVIEW_JOB)}`,
  ])
  return res?.check_runs ?? []
}

/**
 * The real, GitHub-backed `ReviewCiDeps.findCachedReview` cli.ts wires in.
 * Searches ONLY this PR's own prior commits (`prCommitShasNewestFirst`) —
 * never another PR's, never another base branch's, because that is the
 * entire search space this function is given — for a completed `fleet/review`
 * run whose logged `review-key=` line matches exactly.
 *
 * A run's `conclusion` field (`success`/`failure`) — the same field GitHub
 * itself used to colour that check red or green — decides PASS vs FAIL here,
 * never any text parsing of the verdict: it is the one fact about that old
 * run that cannot have been garbled by a log-formatting change since.
 *
 * Deliberately thin and NOT unit-tested directly, matching the
 * `haltedOnGitHub`/`haltedOnGitHubFrom` split in killswitch.ts: the decision
 * logic lives in the pure, tested `extractLoggedReviewKey` and in
 * `runReviewCi`'s own `findReusableVerdict`; this function is the one thing
 * standing between them and the network. `ghJson` never throws (it returns
 * `undefined` on any failure); the raw `gh()` log fetch below CAN throw, and
 * is left to — `runReviewCi` catches it and runs the engine, per the fail-safe
 * contract on `ReviewCiDeps.findCachedReview`.
 */
export function defaultFindCachedReview(ctx: CiContext): (key: string) => Promise<CachedReviewVerdict | undefined> {
  return async (key: string): Promise<CachedReviewVerdict | undefined> => {
    for (const sha of await prCommitShasNewestFirst(ctx.pr)) {
      if (sha === ctx.headSha) continue
      for (const run of await fleetReviewCheckRunsFor(sha)) {
        if (run.status !== 'completed') continue
        if (run.conclusion !== 'success' && run.conclusion !== 'failure') continue
        const logText = await gh(['api', `repos/${REPO}/actions/jobs/${run.id}/logs`, '--allow-escape-sequences'])
        const found = extractLoggedReviewKey(logText)
        if (found === undefined || found.key !== key) continue
        return { sha, verdict: run.conclusion === 'success' ? 'PASS' : 'FAIL', text: found.summary }
      }
    }
    return undefined
  }
}
