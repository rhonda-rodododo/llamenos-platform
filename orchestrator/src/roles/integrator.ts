import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gh, ghJson } from '../gh.js'
import { halt } from '../killswitch.js'

const execFileAsync = promisify(execFile)

/**
 * Owns everything after a PR exists: bringing a PR GitHub reports as
 * `DIRTY` back up to date with `main`, and watching `main` after a merge
 * for the case the reference system (atlas-orchestrator, in the
 * `translatemd` repo) cannot see at all — it merges and nothing ever checks
 * whether the merge it just made broke the branch it landed on.
 */

async function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd: opts.cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })
    return stdout
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    throw new Error(`${cmd} ${args.join(' ')} failed: ${err.stderr ?? err.stdout ?? String(e)}`)
  }
}

async function tryRun(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<boolean> {
  try {
    await run(cmd, args, opts)
    return true
  } catch {
    return false
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** `main`/`master` can never be targeted by this role's own writes, full
 *  stop — no update or revert flow in this module ever legitimately writes
 *  to them directly (a revert lands via a normal reviewed PR, same as any
 *  other change), so a value that resolves to one here is already a bug or
 *  a hostile input, not a normal case to route around. */
export const PROTECTED_BRANCHES: readonly string[] = ['main', 'master']

// ---------------------------------------------------------------------------
// Bring a DIRTY PR branch up to date with main
// ---------------------------------------------------------------------------

export interface UpdateBranchInput {
  worktree: string
  branch: string
}

export interface UpdateBranchResult {
  updated: boolean
  pushed: boolean
  /** True whenever a human needs to look — currently only a merge conflict,
   *  since every other path either succeeds or is a protected-branch bug
   *  (thrown, not returned). */
  needsHuman: boolean
  reason: string
  /** Populated only when `needsHuman` is true because of a conflict — the
   *  paths a human needs to resolve, named directly rather than left for
   *  them to go rediscover with `git status`. */
  conflictingPaths?: string[]
}

/**
 * Brings `branch` up to date with `origin/main` by MERGING `origin/main`
 * into it and pushing the result with an ordinary, non-force push — never
 * by rebasing.
 *
 * This fleet used to rebase DIRTY PRs, which rewrites history and therefore
 * requires a force-push — the one operation capable of destroying a
 * human's unpushed local commits if it is ever pointed at the wrong branch.
 * That trade bought a tidier intermediate history in exchange for keeping a
 * genuinely dangerous capability in the fleet's hands. It wasn't worth it:
 * this repo's ruleset locks the merge method to squash, and the fleet's
 * auto-merge enablement passes `--squash` too — the messy merge commit a
 * plain `git merge` produces here is discarded the moment the PR actually
 * lands on `main`, so a rebase's "cleaner history" was never going to reach
 * `main` anyway. A merge achieves the exact same practical outcome (the PR
 * becomes mergeable) with only a plain, fast-forward-safe push — no force,
 * no history rewrite, nothing here that can ever destroy someone else's
 * work. There is now no force-push call anywhere in this module (see the
 * repo-wide guard test in tests/orchestrator/guards.test.ts).
 *
 * A merge conflict is reported as a `needsHuman` result naming the
 * conflicting paths, never resolved automatically: automated conflict
 * resolution is a much larger risk surface than this operation is worth
 * buying. The merge is aborted so the worktree is left clean either way.
 */
export async function updateBranchFromMain(input: UpdateBranchInput): Promise<UpdateBranchResult> {
  const { worktree, branch } = input
  if (PROTECTED_BRANCHES.includes(branch)) {
    throw new Error(`refusing to update protected branch "${branch}"`)
  }

  await run('git', ['-C', worktree, 'fetch', 'origin', 'main'])

  const mergeOk = await tryRun('git', ['-C', worktree, 'merge', 'origin/main', '--no-edit'])
  if (!mergeOk) {
    const conflictOut = await run('git', ['-C', worktree, 'diff', '--name-only', '--diff-filter=U'])
    const conflictingPaths = conflictOut.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    await tryRun('git', ['-C', worktree, 'merge', '--abort'])
    return {
      updated: false,
      pushed: false,
      needsHuman: true,
      conflictingPaths,
      reason: `merging origin/main into "${branch}" produced conflicts in: ` +
        `${conflictingPaths.join(', ') || '(unable to determine which files)'} — a human needs to resolve this`,
    }
  }

  try {
    await run('git', ['-C', worktree, 'push', 'origin', `HEAD:${branch}`])
  } catch (e) {
    return { updated: true, pushed: false, needsHuman: true, reason: `merge succeeded but push failed: ${errMsg(e)}` }
  }
  return { updated: true, pushed: true, needsHuman: false, reason: `merged origin/main into "${branch}" and pushed, no conflicts` }
}

export interface PrMergeState { headRefName: string; mergeStateStatus: string }

/** `undefined` on any read failure — never mistaken for "not dirty". */
export async function fetchPrMergeState(pr: string): Promise<PrMergeState | undefined> {
  return ghJson<PrMergeState>(['pr', 'view', pr, '--json', 'headRefName,mergeStateStatus'])
}

export function isDirty(state: PrMergeState | undefined): boolean {
  return state !== undefined && state.mergeStateStatus === 'DIRTY'
}

// ---------------------------------------------------------------------------
// Post-merge revert-on-red
// ---------------------------------------------------------------------------

export interface RevertDecisionInput {
  mergeCommitSha: string
  latestMainSha: string
  ciGreenOnLatest: boolean
}

/**
 * True only when `main`'s CI is red AND the merge under watch is STILL the
 * most recent commit on `main`. If a newer commit has landed since, this
 * deliberately returns false: reverting the watched merge would then be
 * reverting the wrong thing — the newer commit may be the actual cause of
 * red, and blind-reverting an unrelated, possibly-good merge on top of an
 * already-broken `main` makes the situation worse, not better, on both
 * counts (it throws away good work AND may not even fix the build).
 */
export function shouldRevertMerge(input: RevertDecisionInput): boolean {
  return !input.ciGreenOnLatest && input.mergeCommitSha === input.latestMainSha
}

export interface RevertResult { reverted: boolean; revertPr?: string; reason: string }

/**
 * Opens a revert PR for `mergeCommitSha` on a BRAND NEW branch this
 * operation creates itself (`revert/<sha>`), then halts the fleet. The push
 * here is a plain push of a branch that did not exist a moment ago — the
 * same non-force push `updateBranchFromMain` above uses; there is no
 * force-push call anywhere in this module (see the repo-wide guard test in
 * tests/orchestrator/guards.test.ts).
 */
export async function revertMerge(input: { worktree: string; mergeCommitSha: string }): Promise<RevertResult> {
  const { worktree, mergeCommitSha } = input
  const branch = `revert/${mergeCommitSha.slice(0, 12)}`

  await run('git', ['-C', worktree, 'fetch', 'origin', 'main'])
  await run('git', ['-C', worktree, 'checkout', '-B', branch, 'origin/main'])
  await run('git', ['-C', worktree, 'revert', '--no-edit', mergeCommitSha])
  await run('git', ['-C', worktree, 'push', '-u', 'origin', branch])

  const prUrl = (await gh([
    'pr', 'create',
    '--title', `Revert: main's CI went red after ${mergeCommitSha.slice(0, 12)}`,
    '--body',
    `Automated revert opened by the Integrator role. \`main\`'s CI went red immediately ` +
    `after commit ${mergeCommitSha} merged, and no other commit has landed on \`main\` since — ` +
    'this is the only candidate, not a guess among several.',
    '--head', branch,
    '--base', 'main',
  ])).trim()

  // Issue #838: awaited so the BLOCKED ping halt() sends is actually
  // in flight before this one-shot process can exit — see circuit.ts's
  // checkBreakers for the same reasoning.
  await halt(`post-merge CI went red at ${mergeCommitSha} (still HEAD of main at detection) — opened ${prUrl} and halted the fleet`)

  return { reverted: true, revertPr: prUrl, reason: 'CI red on the most recent commit on main — opened a revert PR and halted' }
}

export interface PostMergeWatchInput {
  worktree: string
  mergeCommitSha: string
  /** Injected reads, matching the Planner's `invoke` pattern: this keeps
   *  `evaluatePostMerge`'s decision logic testable without mocking GitHub's
   *  API surface directly in this module. */
  getLatestMainSha: () => Promise<string | undefined>
  getCiGreenForSha: (sha: string) => Promise<boolean | undefined>
}

/**
 * One evaluation of the post-merge watch: reads main's current tip and its
 * CI status, and reverts (see `revertMerge`) only when `shouldRevertMerge`
 * says so. An unreadable tip or unreadable CI status is reported as such
 * and never treated as "green" or "still latest" by default — a read
 * failure here must never be indistinguishable from a healthy build.
 */
export async function evaluatePostMerge(input: PostMergeWatchInput): Promise<RevertResult> {
  const latest = await input.getLatestMainSha()
  if (latest === undefined) {
    return { reverted: false, reason: 'could not read the latest commit on main — refusing to guess' }
  }
  const ciGreen = await input.getCiGreenForSha(latest)
  if (ciGreen === undefined) {
    return { reverted: false, reason: 'could not read CI status for the latest commit on main — refusing to guess' }
  }
  const decision: RevertDecisionInput = {
    mergeCommitSha: input.mergeCommitSha,
    latestMainSha: latest,
    ciGreenOnLatest: ciGreen,
  }
  if (!shouldRevertMerge(decision)) {
    return {
      reverted: false,
      reason: ciGreen
        ? 'CI is green on main'
        : `a newer commit (${latest}) has landed on main since ${input.mergeCommitSha} — reverting would revert the wrong thing`,
    }
  }
  return revertMerge({ worktree: input.worktree, mergeCommitSha: input.mergeCommitSha })
}
