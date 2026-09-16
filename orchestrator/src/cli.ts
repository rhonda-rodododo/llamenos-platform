import { existsSync, mkdirSync, mkdtempSync, appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { acquire } from './lock.js'
import { checkHalt, halt, resume, haltedLocally } from './killswitch.js'
import { readAll, append, since, type RunRecord } from './ledger.js'
import { readResumedAt } from './circuit.js'
import { loadLanes, LIMITS, LANE_MODES_FILE, type Lane } from './config.js'
import { checkDispatchDependency, type DependencyReport } from './dependency.js'
import { checkFleetEnvFile } from './fleet-env.js'
import { buildBrief, renderBrief } from './brief.js'
import { loadContracts, contractsFor, buildMemoryContext, augmentBrief } from './memory.js'
import { dispatch as dispatchWorker, type EffortLevel } from './engines.js'
import { verifyMechanical } from './verify.js'
import { secondOpinion, postReview } from './review.js'
import { artifactReviewCache } from './review-cache.js'
import {
  runVerifyCi, runReviewCi, ciContextFromEnv, ciDiff,
  REVIEW_JOB, REVIEW_KEY_ENV, VERIFY_JOB, itemIdFromBranch, fleetBranchFor, type CiContext, type CiVerdict,
} from './ci.js'
import {
  settle as settleWorktree,
  destroyWorktree,
  findWorktreeForBranch,
  currentBranch,
  deleteLocalBranch,
  type SettleTarget,
} from './worktree.js'
import { GitHubSource, toWorkItem, type RawIssue } from './source.js'
import { tick, type TickDeps, type TickResult, type SettleInput, type DispatchOutcome } from './tick.js'
import type { WorkItem } from './source.js'
import { renderDigest, resumeCommand, waitingOnHuman, type DigestInput, type LaneStatus } from './digest.js'
import { deriveItemStatus, renderItemStatus, type PrFacts, type PrState } from './status.js'
import { notify } from './notify.js'
import { FLEET_DIR, LOG_FILE, HALT_REASON_FILE, DISPATCH_SCRIPT, FLEET_ENV_FILE } from './paths.js'
import { REPO, gh, ghJson } from './gh.js'
import { proposeIssues, buildIssueCreateArgs, type ProposedIssue } from './roles/planner.js'
import { updateBranchFromMain, type UpdateBranchInput, type UpdateBranchResult } from './roles/integrator.js'

const execFileAsync = promisify(execFile)

const REPO_ROOT = process.env['FLEET_REPO_ROOT'] ?? process.cwd()

function log(msg: string): void {
  mkdirSync(FLEET_DIR, { recursive: true })
  const line = `${new Date().toISOString()} ${msg}\n`
  appendFileSync(LOG_FILE, line)
  process.stdout.write(line)
}

/**
 * The fleet log is a plain append-only stream of `<timestamp> <message>`
 * lines, and one message per tick is the JSON-encoded TickResult. Reading it
 * back lets `doctor` and `status` — neither of which calls `tick()` — report
 * whether the *last* pass ended in `aborted: 'error'` without needing a
 * second, separate "last result" file to keep in sync with the log.
 */
function lastTickResult(): TickResult | undefined {
  if (!existsSync(LOG_FILE)) return undefined
  const lines = readFileSync(LOG_FILE, 'utf8').split('\n').filter((l) => l.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    const spaceIdx = line.indexOf(' ')
    const rest = spaceIdx >= 0 ? line.slice(spaceIdx + 1) : line
    try {
      const parsed: unknown = JSON.parse(rest)
      if (parsed !== null && typeof parsed === 'object' && 'ran' in parsed) return parsed as TickResult
    } catch {
      continue // not a TickResult line — an ordinary log message
    }
  }
  return undefined
}

export async function doctor(): Promise<number> {
  const checks: [string, boolean, string][] = []
  // Declared here (not beside the lane-scope loop below, where it used to
  // live) so the fleet-env WARN case below and the lane-owned-path WARN case
  // further down share one counter and one summary line.
  let warnings = 0
  let ghOk = false
  try { execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' }); ghOk = true } catch { /* not authed */ }
  checks.push(['gh authenticated', ghOk, 'run: gh auth login'])

  // `gh repo view` takes its target as a bare positional argument, unlike
  // most other `gh` subcommands — it does not accept `-R`/`--repo` at all
  // ("unknown shorthand flag: 'R' in -R"). The shared `gh()` wrapper always
  // appends `-R <REPO>` for exactly the reason documented in gh.ts (pin the
  // repo, never infer it), so it cannot be used for this one command; call
  // the CLI directly instead, the same way the git-remote check below does.
  let repoOk = false
  try { execFileSync('gh', ['repo', 'view', REPO, '--json', 'name'], { stdio: 'pipe' }); repoOk = true } catch { /* unreadable */ }
  checks.push([`repo ${REPO} readable`, repoOk, 'check gh auth and network'])

  // Exactly one remote is an invariant, not a preference: a second remote
  // breaks bare `gh` and makes it possible to push fleet work to the wrong
  // repository. Asserted here so drift surfaces as a failed check.
  // Wrapped: `doctor` is a health check, and a health check that THROWS
  // instead of reporting a failed check is useless in exactly the situation
  // it exists for. This throws wherever REPO_ROOT is not a git repository —
  // including a `git archive` export, which is how the fleet's own tests now
  // run under `fleet/verify`.
  let remotes: string[] = []
  try {
    remotes = execFileSync('git', ['remote'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n').map((r) => r.trim()).filter(Boolean)
  } catch { /* not a git repo, or git unavailable — reported as a failed check below */ }
  checks.push([`exactly one git remote (found: ${remotes.join(', ') || 'none'})`,
    remotes.length === 1 && remotes[0] === 'origin',
    'git remote remove <name> — this repo must only ever have origin -> llamenos-platform'])

  const lanes = await loadLanes(REPO_ROOT)
  for (const l of lanes) {
    checks.push([`lane ${l.id} has scope paths`, l.scope.owned.length > 0,
      `check .claude/agents/fragments/${l.id}-supervisor.md "**Owned paths:**" section`])
  }
  checks.push(['not halted', !haltedLocally(),
    existsSync(HALT_REASON_FILE) ? `halted: ${readFileSync(HALT_REASON_FILE, 'utf8').trim()} — clear with: llamenos-fleet resume` : ''])
  checks.push(['command on PATH', existsSync(`${process.env['HOME']}/.local/bin/llamenos-fleet`),
    `ln -sf ${REPO_ROOT}/orchestrator/bin/llamenos-fleet ~/.local/bin/llamenos-fleet`])

  // R3: tick() never throws — every abnormal exit, including an unexpected
  // one, comes back as `aborted: 'error'`. doctor is a health check, so a
  // pass that errored last time must show up here even though doctor never
  // calls tick() itself.
  const last = lastTickResult()
  checks.push(['last tick pass did not error', last?.aborted !== 'error',
    last?.aborted === 'error' ? `${last.errorMessage ?? '(no message)'} — see ${LOG_FILE}` : ''])

  // The dispatch dependency lives outside this repo (a symlink into the
  // claude-skills git repo, see paths.ts) and cannot be pinned by a llamenos
  // commit, so doctor is the only place its state is ever surfaced. A dirty
  // dependency repo is reported as a WARNING below, not a hard check here —
  // it is normal while iterating on the skill — but every other problem
  // (missing/non-executable script, not a git repo, dead-command rules) is a
  // hard failure: those make dispatch behave in a way this repo cannot trace
  // or trust.
  const dep = checkDispatchDependency()
  const depHardProblems = dep.problems.filter((p) => !/uncommitted/i.test(p))
  checks.push([`dispatch dependency ok (${DISPATCH_SCRIPT})`, depHardProblems.length === 0,
    depHardProblems.join('; ')])

  // #773: the fleet's GitHub identity. `absent` is the expected state until
  // the bot account's token is placed here, so it is a WARNING, printed
  // alongside the lane-scope warnings below — never a hard FAIL, and never
  // something this loop or `bad` below sees. `fail`/`ok` DO go through the
  // normal checks list: once the file exists, wrong permissions or a missing
  // GH_TOKEN are real misconfiguration, not a transitional state.
  const envFile = checkFleetEnvFile()
  if (envFile.state === 'absent') {
    warnings++
  } else {
    checks.push([`fleet env file (${FLEET_ENV_FILE})`, envFile.state === 'ok', envFile.message])
  }

  let bad = 0
  for (const [name, ok, fix] of checks) {
    process.stdout.write(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !fix ? '' : `\n        ${fix}`}\n`)
    if (!ok) bad++
  }

  if (envFile.state === 'absent') {
    process.stdout.write(` WARN  ${envFile.message}\n`)
  }

  // F7: a lane's owned list being non-empty (checked above) says nothing
  // about whether the paths in it actually exist. A fragment can drift from
  // the real tree (e.g. declaring `apps/sip-bridge/` when the directory is
  // actually `sip-bridge/` at the repo root) and the scope checker will
  // silently never match anything under it — the lane is not scoped down,
  // it is scoped to nothing. This is a WARNING, not a hard failure: it is
  // expected to fire for real drift already present on this branch (see
  // backend's fragment), and doctor must stay usable while that is fixed
  // separately rather than refusing to run at all.
  for (const l of lanes) {
    const missing = l.scope.owned.filter((p) => !p.includes('*') && !existsSync(join(REPO_ROOT, p)))
    if (missing.length > 0) {
      warnings++
      process.stdout.write(` WARN  lane ${l.id} owns path(s) that do not exist on disk: ${missing.join(', ')}\n`)
      process.stdout.write(`        check .claude/agents/fragments/${l.id}-supervisor.md "**Owned paths:**" section\n`)
    }
  }

  const modes = lanes.map((l) => `${l.id}=${l.mode}`).join(' ')
  process.stdout.write(`\nlanes: ${modes}\n`)
  process.stdout.write(`lane modes file: ${LANE_MODES_FILE}${existsSync(LANE_MODES_FILE) ? '' : ' (absent — all lanes off)'}\n`)
  if (warnings > 0) {
    process.stdout.write(`\n${warnings} warning(s) above — non-fatal, see WARN lines\n`)
  }

  process.stdout.write(`\ndispatch dependency: ${DISPATCH_SCRIPT}\n`)
  process.stdout.write(`dispatch dependency commit: ${dep.commit ?? '(unknown — not a readable git repo)'}\n`)
  if (dep.problems.length > 0) {
    for (const p of dep.problems) {
      const isWarning = /uncommitted/i.test(p)
      process.stdout.write(`${isWarning ? ' WARN ' : ' FAIL '} dispatch dependency: ${p}\n`)
    }
  }

  // Informational only. #773's bot account isn't live yet, so today this is
  // normally the operator's own login — that's expected, not a problem, and
  // this print is not wired into any check, `bad`, or `warnings` above. It
  // exists purely so a human reading doctor output can see which identity a
  // dispatch would actually push/comment/merge as, without turning "which
  // login is this" into a pass/fail decision doctor makes on anyone's behalf.
  let ghLogin = '(unknown — gh api user failed)'
  try {
    ghLogin = execFileSync('gh', ['api', 'user', '--jq', '.login'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim()
  } catch { /* informational only — the "gh authenticated" check above already reports auth failures */ }
  process.stdout.write(`\ngh token resolves to GitHub login: ${ghLogin}\n`)

  return bad === 0 ? 0 : 1
}

const BRIEFS_DIR = join(FLEET_DIR, 'briefs')

// dispatch-one.sh's own launcher grace beyond a worker's own timeout is 30s
// (engines.ts's POLL_GRACE_MS); 90 minutes is the worker budget itself — long
// enough for a real implementer pass, short enough that a wedged worker does
// not sit a lane's cap out for the rest of a shift.
const DEFAULT_TIMEOUT_SEC = 90 * 60
const DEFAULT_EFFORT: EffortLevel = 'high'
const DEFAULT_MODEL = 'sonnet'

/** One name identifies a dispatched item everywhere: the tmux session
 *  dispatch-one.sh starts, the status file it polls, and the handle `settle`
 *  uses to stop that same session and find its worktree. Lane + item id is
 *  unique by construction (`claimAcrossLanes` gives an item to exactly one
 *  lane), so this never collides across a concurrent pass. */
function nameFor(lane: Lane, item: WorkItem): string {
  return `fleet-${lane.id}-${item.id}`
}

export interface ResolveDispatchDeps {
  /** `git worktree list` lookup — worktree.ts's `findWorktreeForBranch`. */
  findWorktree(repoRoot: string, branch: string): Promise<string | undefined>
  /** `git -C <wt> rev-parse --abbrev-ref HEAD` — worktree.ts's `currentBranch`. */
  currentBranch(worktree: string): Promise<string | undefined>
  /** The PR's head branch as GitHub reports it; `undefined` when unreadable. */
  prHeadBranch(pr: string): Promise<string | undefined>
}

/**
 * Turns a worker's dispatch report into the facts the pipeline acts on, and
 * refuses to act on a report whose work is not on the branch it dispatched.
 *
 * G3 (issue #660/PR #662): audited directly against `dispatch-one.sh`
 * (`~/.claude/skills/supervising-dispatched-sessions/`), the WORKER's own
 * terminal status write (as opposed to the throwaway DISPATCHED seed file
 * the launcher writes before the worker starts) only ever carries `session`,
 * `status`, `pr`, `merged_sha`, `duration_sec`, and `notes` — NEVER `branch`
 * or `worktree`. `branch` is therefore the one known BEFORE dispatch
 * (`fleetBranchFor`, passed to dispatch-one.sh as `--branch` by
 * engines.ts's `buildArgs`), and `worktree` is the one dispatch-one.sh's
 * launch seed reported (engines.ts reads it before the worker can overwrite
 * the file) or, failing that, asked of git directly via `findWorktree`.
 *
 * Issue #812: knowing the expected branch is not the same as the work being
 * on it. dispatch-one.sh used to cut every worktree on the worker NAME
 * (`fleet-shared-704`), so `findWorktree` for `fleet/shared/704` found
 * nothing and tick.ts skipped verification for a "missing worktree" while
 * the PR sat open on a branch neither the fleet nor CI recognised. Both the
 * worktree's ACTUAL checked-out branch and the PR's ACTUAL head branch are
 * now checked against the expected one, and any difference — including one
 * that cannot be read — marks the run FAILED with note
 * `branch-mismatch:<actual>` and sets `branchMismatch`, which tick.ts turns
 * into a PR comment + `needs-human` and never into a verify or an arming.
 * Fail-closed on an unreadable PR head on purpose: auto-merge is armed on a
 * PR NUMBER, and a number whose head is unknown may merge a diff nobody
 * verified.
 *
 * A worker-reported `branch` is never trusted over git: it is replaced by
 * the verified expected branch, or by the actual one on a mismatch.
 *
 * Exported and pure-ish (the git/gh lookups are injected) so this exact
 * repair is unit-tested without a real dispatch-one.sh in sight.
 */
export async function resolveDispatchResult(
  result: DispatchOutcome,
  expectedBranch: string,
  repoRoot: string,
  deps: ResolveDispatchDeps,
): Promise<DispatchOutcome> {
  const worktree = result.worktree ?? await deps.findWorktree(repoRoot, expectedBranch)

  // `actual` is what the note reports; `actualBranch` is only ever a branch
  // git or GitHub really named — a placeholder must never reach the ledger's
  // `branch`, which `revert` later deletes and salvage names branches after.
  let actual: string | undefined
  let actualBranch: string | undefined
  if (worktree !== undefined) {
    const onWorktree = await deps.currentBranch(worktree)
    if (onWorktree !== expectedBranch) { actual = onWorktree ?? 'unknown'; actualBranch = onWorktree }
  }
  if (actual === undefined && result.pr !== undefined) {
    const head = await deps.prHeadBranch(result.pr)
    if (head !== expectedBranch) { actual = head ?? 'unreadable-pr-head'; actualBranch = head }
  }

  if (actual !== undefined) {
    const reason = `branch-mismatch:${actual}`
    return {
      ...result,
      outcome: 'FAILED',
      branch: actualBranch,
      worktree,
      branchMismatch: actual,
      note: result.note ? `${reason} ${result.note}` : reason,
    }
  }
  return { ...result, branch: expectedBranch, worktree }
}

function defaultResolveDispatchDeps(): ResolveDispatchDeps {
  return {
    findWorktree: findWorktreeForBranch,
    currentBranch,
    prHeadBranch: async (pr) =>
      (await ghJson<{ headRefName: string }>(['pr', 'view', pr, '--json', 'headRefName']))?.headRefName,
  }
}

async function realDispatch(item: WorkItem, lane: Lane): Promise<DispatchOutcome> {
  const branch = fleetBranchFor(lane.id, item.id)
  const baseBrief = buildBrief(item, lane, branch)
  // Prior-attempt history and governing contracts are memory.ts's sole
  // concern (see brief.ts's own comment on why: a caller rendering both
  // would duplicate the same failure history under two headings). Contracts
  // are scoped to this lane's owned paths — the same scope the worker's
  // brief already tells it not to leave.
  const contracts = contractsFor(lane.scope.owned, await loadContracts(REPO_ROOT))
  const memoryCtx = buildMemoryContext(item.id, readAll(), contracts)
  const brief = augmentBrief(baseBrief, memoryCtx)
  mkdirSync(BRIEFS_DIR, { recursive: true })
  const briefPath = join(BRIEFS_DIR, `${nameFor(lane, item)}.md`)
  writeFileSync(briefPath, renderBrief(brief))
  const result = await dispatchWorker({
    name: nameFor(lane, item),
    item,
    lane,
    briefPath,
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    model: lane.model ?? DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
  })
  const resolved = await resolveDispatchResult(result, branch, REPO_ROOT, defaultResolveDispatchDeps())
  if (resolved.branchMismatch !== undefined) {
    log(`dispatch: item ${item.id} ${resolved.note ?? ''} — expected ${branch}`)
  }

  // At PR open, which is the earliest moment the PR exists. Best-effort: the
  // worst case is an issue that stays open after its PR merges, which the
  // digest already surfaces, and it must never cost the dispatch itself.
  // Not on a mismatched branch: the item number is derived from the PR's
  // head branch, which by definition is not a fleet branch there.
  if (resolved.pr !== undefined && resolved.branchMismatch === undefined) {
    try {
      await ensureIssueLinkWith(resolved.pr, defaultIssueLinkDeps())
    } catch (e) {
      log(`issue link: failed for PR ${resolved.pr}: ${errMsg(e)}`)
    }
  }
  return resolved
}

async function prDiff(pr: string): Promise<string> {
  return gh(['pr', 'diff', pr])
}

async function commentOnIssue(itemId: string, body: string): Promise<void> {
  await gh(['issue', 'comment', itemId, '--body', body])
}

/**
 * `needsHuman` is FORWARDED, not dropped — and this mapping is a separate,
 * exported, pure function precisely because it was being dropped here, in a
 * hand-written object literal, where nothing could see it. `settle`'s one
 * remaining label write (the `needs-human` label, worktree.ts) could
 * therefore never fire in production: tick.ts sets it for a claimed SUCCESS
 * the fleet could not verify at all (issue #660's shape), and that label is
 * what stops `judge()` re-dispatching the item on the next pass. Without it
 * the fleet re-claims an unverifiable item every tick, forever.
 *
 * A literal that silently omits one field is invisible to TypeScript when
 * every field it does set is optional on the target. The unit test on this
 * function is what makes the omission visible.
 */
export function settleTargetFor(input: SettleInput): SettleTarget {
  return {
    name: nameFor(input.lane, input.item),
    itemId: input.item.id,
    outcome: input.outcome,
    worktree: input.worktree,
    branch: input.branch,
    needsHuman: input.needsHuman,
  }
}

async function settleItem(input: SettleInput): Promise<void> {
  await settleWorktree(settleTargetFor(input), log)
}

/**
 * Sends the reviewer's verdict back into the SAME tmux session
 * `dispatch-one.sh` started for this item (see `nameFor`) — the session
 * `dispatch()` (engines.ts) deliberately never tears down on a terminal
 * status, exactly so this call can still reach it with its worktree
 * intact. `tmux send-keys` types the text into the session's own stdin as
 * if a human had, then presses Enter; this is a best-effort mechanism, not
 * a guaranteed one — it depends on the worker's own CLI still being ready
 * to accept another turn of input at this point, which this repo has not
 * yet exercised end-to-end against a live worker. `runReviewLoop`'s bound
 * of `MAX_REVIEW_ROUNDS` (review.ts) limits the blast radius of that being
 * wrong to two rounds, never an unbounded retry.
 */
async function reviseWithWorker(item: WorkItem, lane: Lane, verdictText: string): Promise<void> {
  const name = nameFor(lane, item)
  const message = `The non-author reviewer requested changes on this PR:\n\n${verdictText}\n\nPlease revise.`
  await execFileAsync('tmux', ['send-keys', '-t', name, message, 'Enter'], { timeout: 10_000 })
}

async function commentOnPr(pr: string, body: string): Promise<void> {
  await gh(['pr', 'comment', pr, '--body', body])
}

/**
 * The fleet's ONE arming call, and it merges nothing itself: it asks GitHub
 * to merge later, on GitHub's terms — every required check green on that
 * exact head SHA (`ci-status`, `fleet/verify`, `fleet/review`) plus any
 * code-owner approval `CODEOWNERS` demands. A push to the branch invalidates
 * the per-SHA checks, so the verified-commit pin `mergePr` used to enforce
 * with `--match-head-commit` is now a property of the platform rather than a
 * flag this process remembers to pass.
 *
 * Reached only after mechanical verification AND the non-author review have
 * both passed — see tick.ts. No bypass flag is passed here and none may ever
 * be added: see the rail in tests/orchestrator/guards.test.ts.
 */
async function enableAutoMerge(pr: string): Promise<void> {
  await gh(['pr', 'merge', pr, '--auto', '--squash', '--delete-branch'])
}

/** Clears an auto-merge armed by an EARLIER attempt on the same PR before
 *  this one was rejected. The only other `gh pr merge` in the fleet, and it
 *  can only ever UN-arm. */
async function disableAutoMerge(pr: string): Promise<void> {
  await gh(['pr', 'merge', pr, '--disable-auto'])
}

/**
 * GitHub closes an issue when a MERGED pull request's body contains
 * `Closes #<n>`. The fleet's workers are told to write that line themselves
 * (brief.ts), but a brief is an instruction, not a guarantee — and a PR that
 * merges without it leaves its issue open forever, with the work already on
 * `main`. This is the belt to that braces.
 *
 * Returns the body to write, or `null` when the line is already present —
 * so the caller can tell "nothing to do" from "write this", and a second
 * tick over the same PR cannot append the line twice.
 *
 * The match is word-bounded on purpose: `Closes #123` must NOT satisfy item
 * `12`. Without `\b` it would, and the fleet would skip linking issue 12
 * because a DIFFERENT issue happened to be referenced — the issue would stay
 * open and nothing would say why. It is case-insensitive because GitHub's
 * own matching is, and a worker writing `closes #12` has satisfied the
 * requirement.
 */
export function ensureClosesLine(body: string, item: string): string | null {
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(String.raw`\bcloses\s+#${escaped}\b`, 'i').test(body)) return null
  return `${body.trimEnd()}\n\nCloses #${item}`
}

export interface IssueLinkDeps {
  /** `undefined` on any read failure, matching `ghJson`'s own contract. */
  readPr(pr: string): Promise<{ body: string; headRefName: string } | undefined>
  editBody(pr: string, body: string): Promise<void>
  log(msg: string): void
}

/**
 * The item number comes from the PR's OWN head branch as GitHub reports it
 * (`fleet/<lane>/<item>`), never from the worker's status file — the same
 * reasoning as `resolveDispatchResult` above: the worker's report is the one
 * source that has already been observed to omit fields it promised.
 *
 * A PR on a non-fleet branch has no issue to link and is left alone.
 */
export async function ensureIssueLinkWith(pr: string, deps: IssueLinkDeps): Promise<void> {
  const view = await deps.readPr(pr)
  if (view === undefined) {
    deps.log(`issue link: could not read PR ${pr} — leaving its body alone`)
    return
  }
  const item = itemIdFromBranch(view.headRefName)
  if (item === undefined) {
    deps.log(`issue link: PR ${pr} is on "${view.headRefName}", not a fleet branch — nothing to link`)
    return
  }
  const updated = ensureClosesLine(view.body, item)
  if (updated === null) return
  await deps.editBody(pr, updated)
  deps.log(`issue link: added "Closes #${item}" to PR ${pr}`)
}

/**
 * `--body-file` from a temp file rather than `--body` with the text as an
 * argv element: a PR body is arbitrary worker-authored prose of unbounded
 * length, and passing it as an argument is how you meet the OS argv limit on
 * exactly the PR whose description was most worth reading.
 */
async function editPrBody(pr: string, body: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'llamenos-fleet-prbody-'))
  try {
    const file = join(dir, 'body.md')
    writeFileSync(file, body)
    await gh(['pr', 'edit', pr, '--body-file', file])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function defaultIssueLinkDeps(): IssueLinkDeps {
  return {
    readPr: (pr) => ghJson<{ body: string; headRefName: string }>(['pr', 'view', pr, '--json', 'body,headRefName']),
    editBody: editPrBody,
    log,
  }
}

async function runTick(): Promise<number> {
  const lanes = await loadLanes(REPO_ROOT)

  const deps: TickDeps = {
    lanes,
    now: () => Date.now(),
    acquireLock: acquire,
    checkHalt,
    readLedger: readAll,
    resumedAt: readResumedAt,
    listItems: (lane) => new GitHubSource(lane.requireLabel).list(),
    readLabels: (id) => new GitHubSource('').labels(id),
    dispatch: realDispatch,
    verifyMechanical,
    prDiff,
    secondOpinion,
    postReview,
    commentOnPr,
    reviseWithWorker,
    haltFleet: halt,
    enableAutoMerge,
    disableAutoMerge,
    commentOnIssue,
    settle: settleItem,
    record: append,
    log,
  }
  const r = await tick(deps)
  log(JSON.stringify(r))

  // R1: `attempted` counts every dispatch() call, success or failure; `failed`
  // is the subset that threw. Printing both means "N attempted" never reads
  // as "N succeeded".
  process.stdout.write(
    `ran: ${r.ran} attempted: ${r.attempted} failed: ${r.failed} shadowed: ${r.shadowed} rejections: ${r.rejections.length}\n`,
  )

  // R3: tick() never throws — an aborted: 'error' pass is the CLI's first and
  // only chance to make an operator-visible distinction between "a quiet
  // night" and "something broke".
  if (r.aborted === 'error') {
    process.stderr.write(`ERROR: tick pass aborted with an error: ${r.errorMessage ?? '(no message)'}\n`)
    return 1
  }
  if (r.aborted !== undefined) {
    process.stdout.write(`aborted: ${r.aborted}${r.breakerReason ? ` (${r.breakerReason})` : ''}\n`)
  }
  if (r.halted) {
    process.stdout.write(`halted: ${r.haltReason ?? 'unknown'}\n`)
  }
  return 0
}

function status(): number {
  const recent = since(24 * 3_600_000)
  const byOutcome = new Map<string, number>()
  for (const r of recent) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1)
  process.stdout.write(`halted: ${haltedLocally() ? 'YES' : 'no'}\n`)
  process.stdout.write(`runs (24h): ${recent.length}\n`)
  for (const [k, v] of [...byOutcome].sort()) process.stdout.write(`  ${k}: ${v}\n`)
  process.stdout.write(`limits: ${LIMITS.maxDispatchesPerHour}/h, halt after ${LIMITS.consecutiveFailuresToHalt} consecutive failures\n`)

  // R3: surface the last tick's error state here too — status is the command
  // an operator runs to ask "is this thing OK", and an errored pass must be
  // impossible to mistake for a quiet one.
  const last = lastTickResult()
  if (last?.aborted === 'error') {
    process.stdout.write(`last tick: ERROR — ${last.errorMessage ?? '(no message)'}\n`)
    return 1
  }
  process.stdout.write(`last tick: ${last ? `ok (attempted ${last.attempted}, failed ${last.failed}, shadowed ${last.shadowed})` : 'none recorded yet'}\n`)
  return 0
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ---------------------------------------------------------------------------
// status <issue> — G1: everything derived on read, nothing from a label.
// ---------------------------------------------------------------------------

export interface StatusItemDeps {
  /** Every ledger row for this item, any order. */
  readRows(itemId: string): RunRecord[]
  /** `undefined` on any read failure, matching `ghJson`'s own contract. */
  readPr(pr: string): Promise<PrFacts | undefined>
  /** `undefined` when the check itself could not be answered (network/auth) —
   *  distinct from a confirmed `false` ("definitely gone"). */
  branchExistsOnOrigin(branch: string): Promise<boolean | undefined>
  findWorktreeForBranch(branch: string): Promise<string | undefined>
}

/**
 * DI-shaped exactly like `revert`/`runIntegrateWith` above, so `gh` and `git`
 * are mocked at this boundary in tests rather than by mocking `child_process`
 * globally. Pulls the most recent PR/branch this item's ledger rows recorded
 * (an item can accumulate several attempts; only the latest PR/branch is
 * still meaningful) and hands everything to `deriveItemStatus` (status.ts),
 * which is pure and reads no label.
 */
export async function statusForItemWith(itemId: string, deps: StatusItemDeps): Promise<string> {
  const rows = deps.readRows(itemId)
  const byRecency = [...rows].sort((a, b) => b.ts - a.ts)
  const latestPr = byRecency.find((r) => r.pr !== undefined)?.pr
  const latestBranch = byRecency.find((r) => r.branch !== undefined)?.branch

  const [pr, branchExists, worktree] = await Promise.all([
    latestPr !== undefined ? deps.readPr(latestPr) : Promise.resolve(undefined),
    latestBranch !== undefined ? deps.branchExistsOnOrigin(latestBranch) : Promise.resolve(undefined),
    latestBranch !== undefined ? deps.findWorktreeForBranch(latestBranch) : Promise.resolve(undefined),
  ])

  return renderItemStatus(deriveItemStatus({
    itemId, rows, pr, branchExists, worktreeExists: latestBranch !== undefined ? worktree !== undefined : undefined,
  }))
}

interface GhPrView {
  state: string
  headRefOid: string
  reviews: { state: string; author: { login: string } }[]
}

function normalizePrState(state: string): PrState {
  if (state === 'MERGED') return 'MERGED'
  if (state === 'CLOSED') return 'CLOSED'
  return 'OPEN'
}

async function readPr(pr: string): Promise<PrFacts | undefined> {
  const view = await ghJson<GhPrView>(['pr', 'view', pr, '--json', 'state,headRefOid,reviews'])
  if (view === undefined) return undefined
  return {
    number: pr,
    state: normalizePrState(view.state),
    headRefOid: view.headRefOid,
    reviews: view.reviews.map((r) => ({ state: r.state, author: r.author.login })),
  }
}

/**
 * `git ls-remote --exit-code` exits 2 specifically for "no matching refs" —
 * a confirmed, definite "the branch is gone" — and non-zero for any other
 * reason (network, auth) means the check itself failed, which must read as
 * `undefined` ("unknown"), never be conflated with a confirmed `false`.
 */
async function branchExistsOnOrigin(branch: string): Promise<boolean | undefined> {
  try {
    await execFileAsync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], { cwd: REPO_ROOT, timeout: 15_000 })
    return true
  } catch (e) {
    const err = e as { code?: number }
    return err.code === 2 ? false : undefined
  }
}

function defaultStatusItemDeps(): StatusItemDeps {
  return {
    readRows: (itemId) => readAll().filter((r) => r.itemId === itemId),
    readPr,
    branchExistsOnOrigin,
    findWorktreeForBranch: (branch) => findWorktreeForBranch(REPO_ROOT, branch),
  }
}

async function runStatusForItem(itemId: string): Promise<number> {
  process.stdout.write(await statusForItemWith(itemId, defaultStatusItemDeps()) + '\n')
  return 0
}

/**
 * The comment posted on the PR being reverted. Merges land `--squash`
 * specifically so a revert is always exactly one commit on `main` to undo —
 * this says so on the PR itself, for whoever finds it later wondering what
 * happened. `revert` does not touch the linked issue's labels: a human
 * decides what state the work should be in after a revert, not the fleet —
 * the fleet's job here is to undo its own artifact, not to render a
 * judgement about the work.
 */
const REVERT_COMMENT =
  'Reverted by `llamenos-fleet revert`. Merges land `--squash`, so this PR was exactly one ' +
  "commit on main — that commit is being undone. This does not relabel the linked issue: a " +
  'human decides what state the work should be in after a revert, not the fleet.'

export interface RevertDeps {
  findRecord(runId: string): RunRecord | undefined
  findWorktreeForBranch(branch: string): Promise<string | undefined>
  destroyWorktree(worktree: string): Promise<void>
  closePr(pr: string, comment: string): Promise<void>
  deleteBranch(branch: string): Promise<void>
  log(msg: string): void
}

/**
 * Undoes exactly one dispatched run's own artifact: the PR (closed, with the
 * branch deleted) and, since a squashed PR merge and a still-open PR both
 * leave a branch behind, the worktree and local branch too. Order matters —
 * git refuses to delete a branch that is checked out in any worktree — so
 * the worktree is torn down FIRST, freeing the branch, before either the PR
 * close or the explicit local branch delete run.
 *
 * A run with no `pr` (dispatch failed before one ever opened) still gets its
 * worktree and branch cleaned up; a run with no `branch` at all (dispatch
 * failed before even that) has nothing left to clean up beyond the ledger
 * lookup itself.
 */
export async function revert(runId: string, deps: RevertDeps): Promise<number> {
  const record = deps.findRecord(runId)
  if (record === undefined) {
    process.stderr.write(`revert: no ledger record found for runId "${runId}"\n`)
    return 1
  }

  if (record.branch !== undefined) {
    const worktree = await deps.findWorktreeForBranch(record.branch)
    if (worktree !== undefined) {
      try {
        await deps.destroyWorktree(worktree)
      } catch (e) {
        deps.log(`revert ${runId}: failed to remove worktree ${worktree}: ${errMsg(e)}`)
      }
    }
  }

  if (record.pr !== undefined) {
    try {
      await deps.closePr(record.pr, REVERT_COMMENT)
    } catch (e) {
      deps.log(`revert ${runId}: failed to close PR ${record.pr}: ${errMsg(e)}`)
    }
  }

  if (record.branch !== undefined) {
    try {
      await deps.deleteBranch(record.branch)
    } catch (e) {
      deps.log(`revert ${runId}: failed to delete branch ${record.branch}: ${errMsg(e)}`)
    }
  }

  deps.log(`REVERTED ${runId} (lane=${record.lane} item=${record.itemId})`)
  process.stdout.write(`reverted ${runId} (lane=${record.lane} item=${record.itemId})\n`)
  return 0
}

function defaultRevertDeps(): RevertDeps {
  return {
    findRecord: (runId) => readAll().find((r) => r.runId === runId),
    findWorktreeForBranch: (branch) => findWorktreeForBranch(REPO_ROOT, branch),
    destroyWorktree,
    closePr: async (pr, comment) => {
      await gh(['pr', 'close', pr, '--delete-branch', '--comment', comment])
    },
    deleteBranch: (branch) => deleteLocalBranch(REPO_ROOT, branch),
    log,
  }
}

const DEFAULT_DIGEST_HOURS = 12

/**
 * Pure assembly of `digest.ts`'s `DigestInput` from already-gathered facts —
 * split out from `runDigest` so the one property that matters most (a
 * source-unreadable last pass produces a degraded banner) is testable
 * without a filesystem or a `gh` call in sight.
 *
 * `lastTick` comes from the fleet log's own JSON-encoded `TickResult` lines
 * (`lastTickResult`, above) — `digest` is a separate process invocation from
 * `tick`, so this is the only channel carrying a pass's `rejections` and
 * `aborted` state forward to it.
 */
export function digestInputFrom(
  lastTick: TickResult | undefined,
  halted: boolean,
  haltReason: string | undefined,
  lanes: LaneStatus[],
  recentRuns: RunRecord[],
  dependency: DependencyReport,
  repoRoot: string,
  // G1: already LIVE-filtered by the caller (runDigest) — see
  // digest.ts's `DigestInput.awaitingHuman` and `waitingOnHuman`'s own
  // comment. Defaults to `[]` so every existing call site (and every test
  // that predates G1) keeps compiling and rendering an empty section rather
  // than being forced to thread a live `gh` result through.
  awaitingHuman: RunRecord[] = [],
): DigestInput {
  return {
    halted,
    haltReason,
    resumeCommand: resumeCommand(repoRoot),
    lanes,
    recentRuns,
    awaitingHuman,
    rejections: lastTick?.rejections ?? [],
    dependency,
    // R3/digest hardening: tick() reports `aborted: 'source-unreadable'`
    // when a lane's board could not be read, running zero dispatches without
    // halting the fleet. That is exactly the reference system's original
    // failure mode (a credential problem made every read fail, and the
    // digest reported a quiet night over a 98-card backlog) — this is the
    // one line that keeps a source-read failure from rendering identically
    // to a healthy, quiet one.
    sourceUnreadable: lastTick?.aborted === 'source-unreadable',
  }
}

/**
 * G1: turns `waitingOnHuman`'s ledger-only candidates into the actual answer
 * by asking `gh` — live, every call — whether each candidate's PR is still
 * open and unmerged. A candidate with no `pr` at all (dispatch never got
 * that far) or whose live `gh` read fails is dropped rather than assumed:
 * this section exists so an operator can trust it, and "we couldn't check"
 * must never render identically to "yes, waiting."
 */
export async function resolveAwaitingHumanWith(
  candidates: RunRecord[],
  readPrFn: (pr: string) => Promise<PrFacts | undefined>,
): Promise<RunRecord[]> {
  const resolved = await Promise.all(candidates.map(async (r): Promise<RunRecord | undefined> => {
    if (r.pr === undefined) return undefined
    const pr = await readPrFn(r.pr)
    return pr !== undefined && pr.state === 'OPEN' ? r : undefined
  }))
  return resolved.filter((r): r is RunRecord => r !== undefined)
}

async function resolveAwaitingHuman(candidates: RunRecord[]): Promise<RunRecord[]> {
  return resolveAwaitingHumanWith(candidates, readPr)
}

async function runDigest(hoursArg?: string): Promise<number> {
  let hours = DEFAULT_DIGEST_HOURS
  if (hoursArg !== undefined) {
    const parsed = Number(hoursArg)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(`digest: invalid hours "${hoursArg}"\n`)
      return 1
    }
    hours = parsed
  }

  const lanes = await loadLanes(REPO_ROOT)
  const haltedNow = haltedLocally()
  const haltReason = haltedNow && existsSync(HALT_REASON_FILE)
    ? readFileSync(HALT_REASON_FILE, 'utf8').trim()
    : undefined
  const dependency = checkDispatchDependency()
  const recentRuns = since(hours * 3_600_000)
  const awaitingHuman = await resolveAwaitingHuman(waitingOnHuman(recentRuns))

  const input = digestInputFrom(
    lastTickResult(),
    haltedNow,
    haltReason,
    lanes.map((l) => ({ id: l.id, mode: l.mode })),
    recentRuns,
    dependency,
    REPO_ROOT,
    awaitingHuman,
  )
  const body = renderDigest(input)
  process.stdout.write(body + '\n')

  // Best-effort, per notify.ts's own contract: a webhook or command sink
  // being unreachable must never fail this command — the digest was still
  // printed above (and to LOG_FILE via `log`), which is the fallback
  // delivery a fresh checkout with nothing configured relies on.
  const result = await notify('Llámenos fleet digest', body)
  if (!result.ok) {
    for (const e of result.errors) log(`digest notify sink failed: ${e}`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// plan — the Planner role, wired to the only sanctioned issue-creation path
// ---------------------------------------------------------------------------

/** The document the Planner reads to decide what to propose next. Missing
 *  entirely is not an error here — the Planner still runs, just with less
 *  context, and its own near-duplicate check and `needs-human` gate are
 *  unaffected either way. */
const GOAL_DOCUMENT_PATH = process.env['FLEET_GOAL_DOCUMENT']
  ?? join(REPO_ROOT, 'docs', 'superpowers', 'plans', '2026-09-12-fleet-live-dispatch.md')

const PLANNER_MODEL = 'opus' // "the most capable model at high effort" per the design spec
const PLANNER_MAX_TURNS = 4
const PLANNER_TIMEOUT_MS = 15 * 60_000

/**
 * One-shot, read-only model invocation — the Planner's ENTIRE effectful
 * surface (see `proposeIssues`'s own boundary comment in roles/planner.ts).
 * `--permission-mode plan` is the same enforcement `review.ts` uses for the
 * non-author verifier: the model can reason over the prompt handed to it,
 * but cannot edit a file or run a destructive command even if it tried.
 */
async function invokePlannerModel(prompt: string): Promise<string> {
  const call = execFileAsync('claude', [
    '--print', '--permission-mode', 'plan', '--model', PLANNER_MODEL, '--max-turns', String(PLANNER_MAX_TURNS),
  ], { timeout: PLANNER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })
  call.child?.stdin?.end(prompt)
  const { stdout } = await call
  return stdout
}

/** The FULL open backlog, unfiltered by any lane's `requireLabel` — the
 *  Planner's near-duplicate check (`isNearDuplicate` in roles/planner.ts)
 *  needs every open issue, not just the subset already admitted to a lane's
 *  dispatch queue. `GitHubSource` is deliberately not reused here: its
 *  `list()` always filters by a required label, which is exactly what this
 *  read must NOT do. */
async function listOpenBacklog(): Promise<WorkItem[]> {
  const raw = await ghJson<RawIssue[]>([
    'issue', 'list', '--state', 'open', '--limit', '200',
    '--json', 'number,title,body,url,state,labels',
  ])
  return raw === undefined ? [] : raw.map(toWorkItem)
}

export interface PlanDeps {
  listOpenBacklog(): Promise<WorkItem[]>
  readRecentRuns(): RunRecord[]
  readGoalDocument(): string
  invoke(prompt: string): Promise<string>
  /**
   * The ONLY function in this file allowed to actually create a GitHub
   * issue for a plan proposal, and it is typed to accept nothing but the
   * argv `buildIssueCreateArgs` itself produces — there is no other
   * parameter shape a caller could construct issue-create argv from, so
   * this path cannot be bypassed by handing it a hand-assembled arg list
   * that "forgot" a label.
   */
  createIssue(args: ReturnType<typeof buildIssueCreateArgs>): Promise<string>
  log(msg: string): void
}

/**
 * Turns each of the Planner's proposals into a real GitHub issue through
 * `buildIssueCreateArgs` — the only sanctioned path, per roles/planner.ts's
 * own module comment — so `needs-human` is attached unconditionally on
 * every issue this command creates, with no parameter anywhere in this
 * function that could suppress it.
 */
export async function runPlanWith(deps: PlanDeps): Promise<number> {
  const [openBacklog, recentRuns, goalDocument] = [
    await deps.listOpenBacklog(), deps.readRecentRuns(), deps.readGoalDocument(),
  ]
  const proposals: ProposedIssue[] = await proposeIssues({
    goalDocument, openBacklog, recentRuns, invoke: deps.invoke,
  })
  for (const proposal of proposals) {
    const args = buildIssueCreateArgs(proposal)
    const out = await deps.createIssue(args)
    deps.log(`plan: created issue for lane ${proposal.lane} (needs-human): ${out.trim()}`)
  }
  process.stdout.write(`plan: proposed ${proposals.length} issue(s), each created with needs-human attached\n`)
  return 0
}

function defaultPlanDeps(): PlanDeps {
  return {
    listOpenBacklog,
    readRecentRuns: () => readAll(),
    readGoalDocument: () => (existsSync(GOAL_DOCUMENT_PATH) ? readFileSync(GOAL_DOCUMENT_PATH, 'utf8') : ''),
    invoke: invokePlannerModel,
    createIssue: (args) => gh(args),
    log,
  }
}

async function runPlan(): Promise<number> {
  return runPlanWith(defaultPlanDeps())
}

// ---------------------------------------------------------------------------
// integrate — the Integrator role's DIRTY-PR update sweep
// ---------------------------------------------------------------------------

/**
 * The fleet's own branch-naming convention (`realDispatch` above builds
 * branches shaped `fleet/${lane.id}/${item.id}`). This is a SCOPE decision
 * for `integrate` only — which PRs it bothers to update — not a security
 * guard: `updateBranchFromMain` (integrator.ts) never force-pushes anything
 * for any branch, fleet-owned or not, so there is no destructive capability
 * here left to gate. It exists purely so `integrate` does not spend its
 * sweep updating a human's own open PR from `main` uninvited.
 */
function isFleetDispatchedBranch(branch: string): boolean {
  return /^fleet\/[^/]+\/[^/]+$/.test(branch)
}

export interface DirtyFleetPr { pr: string; branch: string }

export interface IntegrateDeps {
  /** Every OPEN pull request whose merge state is `DIRTY` and whose branch
   *  the fleet itself dispatched (`isFleetDispatchedBranch`) — a human's
   *  own dirty PR is never in this list, purely so `integrate` doesn't
   *  touch a PR it didn't open. */
  listDirtyFleetPrs(): Promise<DirtyFleetPr[]>
  findWorktreeForBranch(branch: string): Promise<string | undefined>
  updateBranch(input: UpdateBranchInput): Promise<UpdateBranchResult>
  commentOnPr(pr: string, body: string): Promise<void>
  log(msg: string): void
}

/**
 * Sweeps every DIRTY PR the fleet itself dispatched and brings it up to
 * date with `main` via `updateBranchFromMain` (integrator.ts) — a merge
 * plus an ordinary, non-force push, never a rebase. A branch with no
 * worktree left (already cleaned up by `settle`) is skipped rather than
 * guessed at; a merge conflict is commented on the PR naming the
 * conflicting paths, never resolved automatically.
 */
export async function runIntegrateWith(deps: IntegrateDeps): Promise<number> {
  const dirty = await deps.listDirtyFleetPrs()
  let updated = 0
  let needsHuman = 0

  for (const { pr, branch } of dirty) {
    const worktree = await deps.findWorktreeForBranch(branch)
    if (worktree === undefined) {
      deps.log(`integrate: no worktree found for dirty branch "${branch}" (pr ${pr}) — skipping`)
      continue
    }
    const result = await deps.updateBranch({ worktree, branch })
    if (result.pushed) {
      updated++
      deps.log(`integrate: updated and re-pushed "${branch}" (pr ${pr})`)
    } else {
      needsHuman++
      await deps.commentOnPr(pr, `Integrator: ${result.reason}`)
      deps.log(`integrate: did not update "${branch}" (pr ${pr}): ${result.reason}`)
    }
  }

  process.stdout.write(`integrate: ${updated} updated, ${needsHuman} need a human, out of ${dirty.length} dirty PR(s)\n`)
  return 0
}

async function defaultListDirtyFleetPrs(): Promise<DirtyFleetPr[]> {
  const prs = await ghJson<{ number: number; headRefName: string; mergeStateStatus: string }[]>([
    'pr', 'list', '--state', 'open', '--limit', '100',
    '--json', 'number,headRefName,mergeStateStatus',
  ])
  if (prs === undefined) return []
  return prs
    .filter((p) => p.mergeStateStatus === 'DIRTY' && isFleetDispatchedBranch(p.headRefName))
    .map((p) => ({ pr: String(p.number), branch: p.headRefName }))
}

function defaultIntegrateDeps(): IntegrateDeps {
  return {
    listDirtyFleetPrs: defaultListDirtyFleetPrs,
    findWorktreeForBranch: (branch) => findWorktreeForBranch(REPO_ROOT, branch),
    updateBranch: updateBranchFromMain,
    commentOnPr: async (pr, body) => { await gh(['pr', 'comment', pr, '--body', body]) },
    log,
  }
}

async function runIntegrate(): Promise<number> {
  return runIntegrateWith(defaultIntegrateDeps())
}

// ---------------------------------------------------------------------------
// verify-ci / review-ci — the two gates, computed on GitHub's own runners
// ---------------------------------------------------------------------------

/**
 * Both CI entry points take their subject from the environment rather than
 * argv: the workflow already has `github.head_ref` as an expression, and a
 * named variable is harder to get silently wrong than a positional argument.
 * A missing one is a non-zero exit — an entry point that does not know what
 * it is judging must refuse, not guess, and a red job is the right direction.
 *
 * The verdict becomes the EXIT CODE and nothing else. The job's own result is
 * already a check run named `fleet/verify` / `fleet/review`, which is what
 * the ruleset requires; the summary goes to the job log, where a reader
 * follows the red check anyway.
 */
/** Plain stdout, not the fleet log: a CI runner has no fleet state directory
 *  worth writing to, and the job log IS the durable record there. */
const ciLog = (msg: string): void => { process.stdout.write(`${msg}\n`) }

async function runCiGate(job: string, run: (ctx: CiContext) => Promise<CiVerdict>): Promise<number> {
  const ctx = ciContextFromEnv(process.env, REPO_ROOT)
  if (ctx === undefined) {
    process.stderr.write(
      `${job}: FLEET_CI_BRANCH, FLEET_CI_HEAD_DIR, FLEET_CI_HEAD_SHA and FLEET_CI_BASE_SHA ` +
      'must all be set — refusing to judge an unknown tree\n',
    )
    return 2
  }
  const verdict = await run(ctx)
  process.stdout.write(`${job}: ${verdict.ok ? 'PASS' : 'FAIL'} — ${verdict.summary}\n`)
  return verdict.ok ? 0 : 1
}

type CommandHandler = (rest: string[]) => Promise<number> | number

/**
 * One dispatch table, not a `switch` plus a hand-maintained list of valid
 * names: `COMMANDS` (used by the systemd cross-check test) is derived from
 * this object's own keys, so a command that exists here is by construction
 * a command the CLI can run, and there is no second list that can drift out
 * of sync with it. This is exactly the bug this replaces: the digest timer's
 * `ExecStart=... llamenos-fleet digest` pointed at a subcommand that did not
 * exist in the old `switch`, with nothing to catch it before the timer fired
 * for real.
 */
const HANDLERS: Record<string, CommandHandler> = {
  doctor: () => doctor(),
  tick: () => runTick(),
  // With an issue id: derive-and-print that item's status (G1) — everything
  // computed live from the ledger, `gh`, and `git`, nothing from a label.
  // With no argument: the existing fleet-wide overview, unchanged.
  status: (rest) => (rest[0] !== undefined ? runStatusForItem(rest[0]) : status()),
  halt: (rest) => { halt(rest.join(' ') || 'halted by hand'); log('HALTED'); return 0 },
  resume: () => { resume(); log('RESUMED'); return 0 },
  revert: (rest) => {
    const runId = rest[0]
    if (runId === undefined) {
      process.stderr.write('usage: llamenos-fleet revert <runId>\n')
      return 2
    }
    return revert(runId, defaultRevertDeps())
  },
  digest: (rest) => runDigest(rest[0]),
  'verify-ci': () => runCiGate(VERIFY_JOB, (ctx) => runVerifyCi({
    ctx,
    lanes: () => loadLanes(REPO_ROOT),
    verify: verifyMechanical,
    pathExists: existsSync,
    log: ciLog,
  })),
  'review-ci': () => runCiGate(REVIEW_JOB, (ctx) => runReviewCi({
    ctx,
    apiKey: process.env[REVIEW_KEY_ENV],
    lanes: () => loadLanes(REPO_ROOT),
    verify: verifyMechanical,
    pathExists: existsSync,
    log: ciLog,
    prDiff: () => ciDiff(ctx),
    secondOpinion,
    // `FLEET_REVIEW_CACHE_DIR` unset (e.g. a local run) disables recording
    // without disabling lookup — a lookup that finds nothing behaves
    // identically either way, and this command still runs the engine.
    cache: artifactReviewCache(process.env['FLEET_REVIEW_CACHE_DIR'], ciLog),
  })),
  plan: () => runPlan(),
  integrate: () => runIntegrate(),
}

/** Every subcommand name this CLI actually implements — see `HANDLERS`. */
export const COMMANDS = Object.keys(HANDLERS)

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)
  const handler = cmd !== undefined ? HANDLERS[cmd] : undefined
  if (handler === undefined) {
    process.stderr.write(`usage: llamenos-fleet <${COMMANDS.join('|')}>\n`)
    process.exit(2)
  }
  process.exit(await handler(rest))
}

// Guarded so this module can be `import`ed (as tests do, to exercise `doctor`
// and friends directly) without also running the CLI's argv-parsing entry
// point — `import.meta.main` is true only when this file is the process's
// own entry point (`bun orchestrator/src/cli.ts ...` or the `llamenos-fleet`
// wrapper), never when another module imports it.
if (import.meta.main) {
  void main().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(`FATAL: unhandled error in fleet CLI: ${msg}\n`)
    process.exit(1)
  })
}
