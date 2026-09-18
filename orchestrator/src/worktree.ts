import { execFile } from 'node:child_process'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { promisify } from 'node:util'
import { gh } from './gh.js'
import type { Outcome } from './ledger.js'
import { NEEDS_HUMAN_LABEL } from './roles/planner.js'

const execFileAsync = promisify(execFile)

async function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: opts.timeout ?? 30_000,
      cwd: opts.cwd,
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    throw new Error(`${cmd} ${args.join(' ')} failed: ${err.stderr ?? err.stdout ?? String(e)}`)
  }
}

/**
 * Stops the tmux session `dispatch-one.sh` started for this worker, by name.
 * A session that has already ended — the common case, since the worker's own
 * launcher footer already tore it down on a terminal status — makes
 * `tmux kill-session` exit non-zero; that is "nothing to stop", not a
 * failure, so it is swallowed rather than propagated.
 */
export async function stopSession(name: string): Promise<void> {
  try {
    await execFileAsync('tmux', ['kill-session', '-t', name], { timeout: 10_000 })
  } catch {
    // No such session — already stopped.
  }
}

/**
 * Kills any process whose invocation still mentions the worktree path.
 * Argv-only via `execFile`, matching every other subprocess call in this
 * fleet — never a shell — so a worktree path is never interpreted as
 * anything but a literal argument. `pkill` exiting 1 (no match) is the
 * common case and is not an error.
 */
export async function killWorktreeProcesses(worktree: string): Promise<void> {
  try {
    await execFileAsync('pkill', ['-f', worktree], { timeout: 10_000 })
  } catch {
    // No matching process — nothing to kill.
  }
}

export interface SalvageResult { salvaged: boolean; branch?: string }

/**
 * Commits and pushes any uncommitted work in `worktree` to a fresh, clearly
 * named branch — BEFORE the worktree is destroyed. This is the fix for the
 * loss the spec calls out by name: a worker killed mid-flight (a timeout, a
 * crash, an operator's `halt`) can leave correct, uncommitted work sitting in
 * its worktree, and destroying that worktree without salvaging it first
 * throws the work away even though it was right. A worktree with nothing
 * uncommitted salvages nothing and reports `salvaged: false` — there was
 * nothing to preserve, not a failure to preserve it.
 */
export async function salvageUncommittedWork(worktree: string, branchHint: string): Promise<SalvageResult> {
  const status = await run('git', ['-C', worktree, 'status', '--porcelain'])
  if (status.trim().length === 0) return { salvaged: false }

  const salvageBranch = `salvage/${branchHint}-${Date.now()}`
  await run('git', ['-C', worktree, 'checkout', '-b', salvageBranch])
  await run('git', ['-C', worktree, 'add', '-A'])
  await run('git', ['-C', worktree, 'commit', '-m', `salvage: uncommitted work from ${branchHint}`])
  await run('git', ['-C', worktree, 'push', '-u', 'origin', salvageBranch])
  return { salvaged: true, branch: salvageBranch }
}

/**
 * `--force` because a worktree that just had work salvaged onto a new branch
 * checked out inside it is, from the main repo's point of view, exactly as
 * "dirty" as `--force` exists to push through — the salvage step above is
 * what makes discarding that state safe.
 *
 * Resolves the repository's shared `.git` directory first (`rev-parse
 * --git-common-dir`, run from inside the worktree itself) and passes it via
 * `--git-dir`, rather than relying on the caller's own working directory
 * being somewhere inside the repo. `tick`'s `SettleInput` carries only the
 * worktree path, not a separate handle on the main checkout — this makes
 * that unnecessary.
 */
export async function destroyWorktree(worktree: string): Promise<void> {
  const commonDirRaw = (await run('git', ['-C', worktree, 'rev-parse', '--git-common-dir'])).trim()
  const gitDir = isAbsolute(commonDirRaw) ? commonDirRaw : resolvePath(worktree, commonDirRaw)
  await run('git', ['--git-dir', gitDir, 'worktree', 'remove', '--force', worktree])
}

export async function labelIssue(itemId: string, label: string): Promise<void> {
  await gh(['issue', 'edit', itemId, '--add-label', label])
}

/**
 * Finds the worktree checked out on `branch`, if one still exists, by asking
 * `repoRoot`'s own git — not by reconstructing dispatch-one.sh's worktree
 * naming convention (`~/projects/<repo>-<name>`). That convention lives in a
 * dependency this repo does not own (see paths.ts's `DISPATCH_SCRIPT`
 * comment) and can change there with no llamenos commit at all; asking git
 * directly is the only source of truth that cannot drift out from under
 * `revert`.
 *
 * `git worktree list --porcelain` emits one blank-line-separated block per
 * worktree, each a `worktree <path>` line followed by either `branch
 * refs/heads/<name>` or `detached` (or `bare` for the main worktree with no
 * checkout). Only a `branch` line is ever matched against.
 */
export async function findWorktreeForBranch(repoRoot: string, branch: string): Promise<string | undefined> {
  const out = await run('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'])
  let current: string | undefined
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = line.slice('worktree '.length).trim()
    } else if (line.startsWith('branch ') && current !== undefined) {
      if (line.slice('branch '.length).trim() === `refs/heads/${branch}`) return current
    } else if (line.trim().length === 0) {
      current = undefined
    }
  }
  return undefined
}

/**
 * The branch `worktree` actually has checked out, asked of that worktree's
 * own git — `undefined` when it cannot be read (the path is gone, or is not
 * a worktree). A detached HEAD reads as the literal `HEAD`, which is never a
 * fleet branch and so is reported as a mismatch by the caller, not hidden.
 */
export async function currentBranch(worktree: string): Promise<string | undefined> {
  try {
    const out = (await run('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    return out.length > 0 ? out : undefined
  } catch {
    return undefined
  }
}

/**
 * Deletes a local branch by name, swallowing "no such branch" the same way
 * `stopSession` swallows "no such session" — the common caller (`revert`)
 * may run this after `gh pr close --delete-branch` already removed it, or
 * against a run that never got far enough to push a branch at all.
 */
export async function deleteLocalBranch(repoRoot: string, branch: string): Promise<void> {
  try {
    await run('git', ['-C', repoRoot, 'branch', '-D', branch])
  } catch {
    // Already gone, or never existed.
  }
}

export interface SettleTarget {
  name: string
  itemId: string
  outcome: Outcome
  worktree?: string
  branch?: string
  /**
   * The one control-label write settle() still performs: adds `needs-human`
   * when the fleet is leaving an open PR for a person rather than something
   * it will retry itself — see `SettleInput`'s own doc comment in tick.ts for
   * exactly which two cases set this. `judge()` (select.ts) already vetoes
   * any item carrying `needs-human`, so this is what keeps a handed-off item
   * from being re-claimed on the next pass — not a record of what happened
   * (that is derived on read; see ledger.ts's module comment), but an
   * instruction to the fleet's own future self.
   */
  needsHuman?: boolean
}

/**
 * The single teardown path for a dispatched item, whatever happened to it.
 * Order is the safety property:
 *
 * 1. Stop the session and kill any surviving process FIRST — nothing should
 *    still be writing into the worktree while it is being salvaged.
 * 2. Salvage. If salvage itself fails, the worktree is deliberately left
 *    standing rather than destroyed: "salvage before teardown" only holds if
 *    a failed salvage also cancels the teardown, not just runs before it and
 *    gets ignored.
 * 3. Destroy — reached only when salvage succeeded or had nothing to do.
 * 4. Add `needs-human`, if the caller says this outcome is one (see
 *    `SettleTarget.needsHuman`'s own comment). This is the ONLY label
 *    `settle()` writes — see ledger.ts's module comment on why an outcome
 *    label (`fleet:merged`, `fleet:rejected`, ...) is never written here at
 *    all: whether a PR merged is a fact about GitHub's state, derived on
 *    read (`llamenos-fleet status <issue>`), never cached as a label that
 *    can drift from what actually happened to the PR.
 *
 * Each step's own failure is logged and does not stop the ones after it
 * (except salvage -> destroy, per above): a labelling failure must not skip
 * destroying an already-salvaged worktree, since skipping that is exactly
 * how a worktree leaks.
 */
export async function settle(target: SettleTarget, log: (msg: string) => void): Promise<void> {
  await stopSession(target.name)

  if (target.worktree !== undefined) {
    await killWorktreeProcesses(target.worktree)

    let safeToDestroy = true
    try {
      const result = await salvageUncommittedWork(target.worktree, target.branch ?? target.name)
      if (result.salvaged) log(`salvaged uncommitted work for issue ${target.itemId} to ${result.branch}`)
    } catch (e) {
      safeToDestroy = false
      log(`salvage failed for issue ${target.itemId} — refusing to destroy the worktree: ${errMsg(e)}`)
    }

    if (safeToDestroy) {
      try {
        await destroyWorktree(target.worktree)
      } catch (e) {
        log(`worktree removal failed for issue ${target.itemId}: ${errMsg(e)}`)
      }
    }
  }

  if (target.needsHuman === true) {
    try {
      await labelIssue(target.itemId, NEEDS_HUMAN_LABEL)
    } catch (e) {
      log(`labelling issue ${target.itemId} with ${NEEDS_HUMAN_LABEL} failed: ${errMsg(e)}`)
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
