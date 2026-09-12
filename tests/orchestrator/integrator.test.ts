import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Same reasoning as worktree.test.ts: `git` passes through to the real
// execFile against real temp repos (rebase behaviour must be exercised for
// real — this suite's whole point is a subtle git behaviour that a mock
// cannot faithfully reproduce), while `gh` is trapped by a configurable mock
// so this suite never depends on network access or authentication.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { vi: vitest } = await import('vitest')
  const { promisify: nodePromisify } = await import('node:util')
  const realExecFileAsync = nodePromisify(actual.execFile)
  const mockFn = vitest.fn()
  ;(mockFn as unknown as Record<symbol, unknown>)[nodePromisify.custom] =
    (file: string, args?: readonly string[], options?: unknown) => {
      if (file === 'git') return realExecFileAsync(file, args as string[], options as never)
      return mockFn(file, args, options)
    }
  return { ...actual, execFile: mockFn }
})

// killswitch.ts's halt()/resume() write real files under a FLEET_HOME every
// test FILE in this suite shares (see vitest.orchestrator.config.ts) — real
// halt/resume calls here would race killswitch.test.ts's and circuit.test.ts's
// own halt-file assertions on disk, since vitest's per-file module isolation
// does not isolate the filesystem underneath it. `halt` is mocked so this
// suite can assert exactly what reason the Integrator gave it, without ever
// writing to that shared state.
vi.mock('../../orchestrator/src/killswitch.js', () => ({ halt: vi.fn() }))

import { execFile } from 'node:child_process'
import {
  updateBranchFromMain, shouldRevertMerge,
  revertMerge, evaluatePostMerge, PROTECTED_BRANCHES,
} from '../../orchestrator/src/roles/integrator.js'
import { halt } from '../../orchestrator/src/killswitch.js'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>
const mockHalt = halt as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockExecFile.mockReset()
  mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
  mockHalt.mockReset()
})

// --- Real git fixtures -----------------------------------------------------

const createdDirs: string[] = []
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of createdDirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }) } catch { /* already gone */ }
  }
})

function git(cwd: string, args: string): void {
  execSync(`git ${args}`, { cwd })
}

interface Fixture { bareOrigin: string; worktree: string; branch: string }

/** A bare "origin" plus a linked worktree checked out on `branch`, one
 *  commit ahead of `main`. */
function makeFixture(branch = 'fleet/backend/1'): Fixture {
  const bareOrigin = tmp('llamenos-fleet-int-origin-')
  // Pin the bare repo's default branch explicitly: `git init --bare` fixes
  // HEAD at init time from init.defaultBranch, which is unset (and falls
  // back to git's legacy "master") on a runner with no global gitconfig.
  // Without -b main here, HEAD points at a ref that's never created (the
  // "main" branch only exists after the seed repo below pushes it), so a
  // later `git clone` of this origin checks out nothing and every fixture
  // built on top loses its local "main" branch to push against.
  git(bareOrigin, 'init -q --bare -b main')

  const seed = tmp('llamenos-fleet-int-seed-')
  git(seed, 'init -q -b main')
  git(seed, 'config user.email test@example.com')
  git(seed, 'config user.name Test')
  execSync('echo base > base.txt', { cwd: seed, shell: '/bin/bash' })
  git(seed, 'add base.txt')
  git(seed, 'commit -qm base')
  git(seed, `remote add origin ${bareOrigin}`)
  git(seed, 'push -q -u origin main')

  const worktree = join(tmp('llamenos-fleet-int-parent-'), 'wt')
  git(seed, `worktree add -q -b ${branch} ${worktree} main`)
  git(worktree, 'config user.email test@example.com')
  git(worktree, 'config user.name Test')
  execSync('echo feat > feat.txt', { cwd: worktree, shell: '/bin/bash' })
  git(worktree, 'add feat.txt')
  git(worktree, 'commit -qm "feat commit"')
  git(worktree, `push -q -u origin ${branch}`)

  return { bareOrigin, worktree, branch }
}

function remoteBranchHead(bareOrigin: string, branch: string): string {
  return execSync(`git rev-parse ${branch}`, { cwd: bareOrigin }).toString().trim()
}

function remoteHasBranch(bareOrigin: string, branch: string): boolean {
  const list = execSync('git branch --list', { cwd: bareOrigin }).toString()
  return list.includes(branch)
}

// ---------------------------------------------------------------------------

describe('updateBranchFromMain', () => {
  it('merges origin/main into the branch and pushes without force when nothing conflicts', async () => {
    const f = makeFixture()
    // Advance origin/main with an unrelated commit so there is something to merge in.
    const clone = tmp('llamenos-fleet-int-clone-')
    git(clone, `clone -q ${f.bareOrigin} .`)
    git(clone, 'config user.email test@example.com')
    git(clone, 'config user.name Test')
    execSync('echo other > other.txt', { cwd: clone, shell: '/bin/bash' })
    git(clone, 'add other.txt')
    git(clone, 'commit -qm "unrelated main commit"')
    git(clone, 'push -q origin main')

    const before = remoteBranchHead(f.bareOrigin, f.branch)
    const result = await updateBranchFromMain({ worktree: f.worktree, branch: f.branch })

    expect(result).toEqual({ updated: true, pushed: true, needsHuman: false, reason: expect.any(String) })
    const after = remoteBranchHead(f.bareOrigin, f.branch)
    expect(after).not.toBe(before) // a merge commit was created and actually re-pushed

    // Both origin/main's new file and the branch's own feature file survived.
    const featContent = execSync(`git show ${f.branch}:feat.txt`, { cwd: f.bareOrigin }).toString()
    const otherContent = execSync(`git show ${f.branch}:other.txt`, { cwd: f.bareOrigin }).toString()
    expect(featContent).toBe('feat\n')
    expect(otherContent).toBe('other\n')

    // MUTATION GUARD (no-force push): the push must have been an ordinary,
    // fast-forward-safe push — verified here by the fact it succeeded at
    // all without `--force`/`--force-with-lease` ever appearing in any git
    // invocation this test drove (see the repo-wide guard test in
    // guards.test.ts for the static version of this check).
  })

  it('reports a needs-human outcome naming the conflicting paths on a merge conflict, and pushes nothing', async () => {
    const f = makeFixture()
    // Make origin/main and the branch touch the SAME file differently, so
    // merging origin/main into the branch produces a real conflict.
    const clone = tmp('llamenos-fleet-int-clone2-')
    git(clone, `clone -q ${f.bareOrigin} .`)
    git(clone, 'config user.email test@example.com')
    git(clone, 'config user.name Test')
    execSync('echo from-main > feat.txt', { cwd: clone, shell: '/bin/bash' })
    git(clone, 'add feat.txt')
    git(clone, 'commit -qm "main also touches feat.txt"')
    git(clone, 'push -q origin main')

    const beforeBranchHead = remoteBranchHead(f.bareOrigin, f.branch)
    const result = await updateBranchFromMain({ worktree: f.worktree, branch: f.branch })

    expect(result.updated).toBe(false)
    expect(result.pushed).toBe(false)
    expect(result.needsHuman).toBe(true)
    expect(result.conflictingPaths).toEqual(['feat.txt'])
    expect(result.reason).toContain('feat.txt')
    expect(result.reason).toMatch(/conflict/i)
    expect(result.reason).toMatch(/human/i)

    // MUTATION GUARD: the remote branch must be untouched — a version of
    // this function that pushed anyway (even a truncated result) would
    // fail this assertion, whereas a test that only checked `result.pushed`
    // could in principle pass against a buggy implementation that pushed
    // without setting that flag correctly.
    expect(remoteBranchHead(f.bareOrigin, f.branch)).toBe(beforeBranchHead)

    // And the worktree itself must not be left mid-merge.
    const status = execSync('git status --porcelain=v1 --branch', { cwd: f.worktree }).toString()
    expect(status).not.toMatch(/(MERGING|merging)/)
  })

  it('refuses outright to update a protected branch', async () => {
    const f = makeFixture()
    await expect(updateBranchFromMain({ worktree: f.worktree, branch: 'main' })).rejects.toThrow(/protected/i)
  })

  it.each(PROTECTED_BRANCHES)('refuses protected branch %s', async (branch) => {
    const f = makeFixture()
    await expect(updateBranchFromMain({ worktree: f.worktree, branch })).rejects.toThrow(/protected/i)
  })
})

describe('shouldRevertMerge', () => {
  it('reverts when CI is red and the merge is still the most recent commit', () => {
    expect(shouldRevertMerge({ mergeCommitSha: 'abc', latestMainSha: 'abc', ciGreenOnLatest: false })).toBe(true)
  })

  it('does NOT revert when something else has landed on main since — reverting would revert the wrong thing', () => {
    expect(shouldRevertMerge({ mergeCommitSha: 'abc', latestMainSha: 'def', ciGreenOnLatest: false })).toBe(false)
  })

  it('does not revert when CI is green, even if it is still the latest commit', () => {
    expect(shouldRevertMerge({ mergeCommitSha: 'abc', latestMainSha: 'abc', ciGreenOnLatest: true })).toBe(false)
  })
})

describe('revertMerge', () => {
  it('opens a revert PR on a freshly created branch and halts the fleet', async () => {
    const f = makeFixture()
    // Land the "merge" commit for real on origin/main so `git revert` has
    // something to revert.
    const clone = tmp('llamenos-fleet-int-clone3-')
    git(clone, `clone -q ${f.bareOrigin} .`)
    git(clone, 'config user.email test@example.com')
    git(clone, 'config user.name Test')
    execSync('echo broke > broke.txt', { cwd: clone, shell: '/bin/bash' })
    git(clone, 'add broke.txt')
    git(clone, 'commit -qm "the bad merge"')
    git(clone, 'push -q origin main')
    const mergeSha = execSync('git rev-parse main', { cwd: clone }).toString().trim()

    mockExecFile.mockImplementation((file: string, args: string[]) => {
      if (file === 'gh' && args[0] === 'pr' && args[1] === 'create') {
        return Promise.resolve({ stdout: 'https://github.com/example/pr/99\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    expect(mockHalt).not.toHaveBeenCalled()
    const result = await revertMerge({ worktree: f.worktree, mergeCommitSha: mergeSha })

    expect(result.reverted).toBe(true)
    expect(result.revertPr).toBe('https://github.com/example/pr/99')
    expect(mockHalt).toHaveBeenCalledTimes(1) // the fleet-wide halt actually fired
    expect(mockHalt.mock.calls[0]?.[0]).toMatch(new RegExp(mergeSha))

    const revertBranch = `revert/${mergeSha.slice(0, 12)}`
    expect(remoteHasBranch(f.bareOrigin, revertBranch)).toBe(true)
    // The revert branch does not contain the bad file — the revert worked.
    const files = execSync(`git ls-tree -r --name-only ${revertBranch}`, { cwd: f.bareOrigin }).toString()
    expect(files).not.toContain('broke.txt')

    const prCreateCall = mockExecFile.mock.calls.find(
      (c) => c[0] === 'gh' && Array.isArray(c[1]) && c[1][0] === 'pr' && c[1][1] === 'create',
    )
    expect(prCreateCall).toBeDefined()
    const args = prCreateCall?.[1] as string[]
    expect(args).toContain('--head')
    expect(args[args.indexOf('--head') + 1]).toBe(revertBranch)
    expect(args).toContain('--base')
    expect(args[args.indexOf('--base') + 1]).toBe('main')
  })
})

describe('evaluatePostMerge', () => {
  it('reverts when CI is red on the still-latest merge commit', async () => {
    const f = makeFixture()
    const clone = tmp('llamenos-fleet-int-clone4-')
    git(clone, `clone -q ${f.bareOrigin} .`)
    git(clone, 'config user.email test@example.com')
    git(clone, 'config user.name Test')
    execSync('echo broke > broke.txt', { cwd: clone, shell: '/bin/bash' })
    git(clone, 'add broke.txt')
    git(clone, 'commit -qm "the bad merge"')
    git(clone, 'push -q origin main')
    const mergeSha = execSync('git rev-parse main', { cwd: clone }).toString().trim()

    mockExecFile.mockImplementation((file: string, args: string[]) => {
      if (file === 'gh' && args[0] === 'pr' && args[1] === 'create') {
        return Promise.resolve({ stdout: 'https://github.com/example/pr/1\n', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    const result = await evaluatePostMerge({
      worktree: f.worktree,
      mergeCommitSha: mergeSha,
      getLatestMainSha: async () => mergeSha,
      getCiGreenForSha: async () => false,
    })
    expect(result.reverted).toBe(true)
    expect(mockHalt).toHaveBeenCalledTimes(1)
  })

  it('does NOT revert when a newer commit has landed on main since the merge', async () => {
    const f = makeFixture()
    const result = await evaluatePostMerge({
      worktree: f.worktree,
      mergeCommitSha: 'the-watched-merge-sha',
      getLatestMainSha: async () => 'a-completely-different-newer-sha',
      getCiGreenForSha: async () => false,
    })
    expect(result.reverted).toBe(false)
    expect(result.reason).toMatch(/newer commit/i)
    expect(mockHalt).not.toHaveBeenCalled()
    // MUTATION GUARD: prove revertMerge's own side effects never ran —
    // no revert branch reached the remote under any plausible name.
    expect(remoteHasBranch(f.bareOrigin, 'revert/the-watched-')).toBe(false)
  })

  it('does not revert when CI is green', async () => {
    const result = await evaluatePostMerge({
      worktree: '/does/not/matter',
      mergeCommitSha: 'sha1',
      getLatestMainSha: async () => 'sha1',
      getCiGreenForSha: async () => true,
    })
    expect(result).toEqual({ reverted: false, reason: expect.stringMatching(/green/i) })
  })

  it('refuses to guess when the latest main sha cannot be read', async () => {
    const result = await evaluatePostMerge({
      worktree: '/does/not/matter',
      mergeCommitSha: 'sha1',
      getLatestMainSha: async () => undefined,
      getCiGreenForSha: async () => true,
    })
    expect(result.reverted).toBe(false)
    expect(result.reason).toMatch(/could not read/i)
  })
})
