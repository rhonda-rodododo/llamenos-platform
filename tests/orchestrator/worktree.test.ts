import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// worktree.ts calls `promisify(execFile)` once at import time, same reasoning
// as review.test.ts: the `util.promisify.custom` hook must exist on the mock
// BEFORE worktree.ts is imported. `git` passes through to the REAL execFile
// (salvage/destroy are exercised against real temp git repos below); `tmux`,
// `pkill` and `gh` are trapped by the mock so this suite never depends on
// those binaries being installed or authenticated.
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

import { execFile } from 'node:child_process'
import {
  stopSession, killWorktreeProcesses, salvageUncommittedWork, destroyWorktree, labelIssue, settle,
} from '../../orchestrator/src/worktree.js'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockExecFile.mockReset()
  mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
})

// --- Real git fixtures: a bare "origin" plus a linked worktree off a main repo ---

const createdDirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

interface Fixture { bareOrigin: string; mainRepo: string; worktree: string; branch: string }

function makeFixture(): Fixture {
  const bareOrigin = tmp('llamenos-fleet-wt-origin-')
  execSync('git init -q --bare', { cwd: bareOrigin })

  const mainRepo = tmp('llamenos-fleet-wt-main-')
  execSync('git init -q -b main', { cwd: mainRepo })
  execSync('git config user.email test@example.com', { cwd: mainRepo })
  execSync('git config user.name Test', { cwd: mainRepo })
  writeFileSync(join(mainRepo, 'file.txt'), 'hello\n')
  execSync('git add file.txt', { cwd: mainRepo })
  execSync('git commit -q -m init', { cwd: mainRepo })
  execSync(`git remote add origin ${bareOrigin}`, { cwd: mainRepo })
  execSync('git push -q -u origin main', { cwd: mainRepo })

  const branch = 'work-1'
  const worktree = join(tmp('llamenos-fleet-wt-parent-'), 'wt')
  execSync(`git worktree add -q -b ${branch} ${worktree} main`, { cwd: mainRepo })
  execSync('git config user.email test@example.com', { cwd: worktree })
  execSync('git config user.name Test', { cwd: worktree })

  return { bareOrigin, mainRepo, worktree, branch }
}

afterEach(() => {
  for (const d of createdDirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }) } catch { /* already gone */ }
  }
})

describe('stopSession', () => {
  it('calls tmux kill-session with the given name', async () => {
    await stopSession('fleet-ios-42')
    expect(mockExecFile).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'fleet-ios-42'], expect.anything())
  })

  it('does not throw when the session no longer exists', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('no session'))
    await expect(stopSession('gone')).resolves.toBeUndefined()
  })
})

describe('killWorktreeProcesses', () => {
  it('calls pkill -f with the worktree path', async () => {
    await killWorktreeProcesses('/some/worktree')
    expect(mockExecFile).toHaveBeenCalledWith('pkill', ['-f', '/some/worktree'], expect.anything())
  })

  it('does not throw when nothing matches', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('exit 1'))
    await expect(killWorktreeProcesses('/none')).resolves.toBeUndefined()
  })
})

describe('salvageUncommittedWork', () => {
  it('reports salvaged: false and touches nothing when the worktree is clean', async () => {
    const f = makeFixture()
    const result = await salvageUncommittedWork(f.worktree, f.branch)
    expect(result).toEqual({ salvaged: false })
    // MUTATION GUARD: a version of this function that always tries to push
    // would fail loudly here (there is nothing to commit), which is exactly
    // the case this early return exists to skip.
  })

  it('commits and pushes uncommitted work to a new salvage branch', async () => {
    const f = makeFixture()
    writeFileSync(join(f.worktree, 'uncommitted.txt'), 'rescue me\n')
    const result = await salvageUncommittedWork(f.worktree, f.branch)
    expect(result.salvaged).toBe(true)
    expect(result.branch).toMatch(new RegExp(`^salvage/${f.branch}-\\d+$`))

    // Proof it actually reached the remote, not just a local branch: list
    // branches on the bare "origin" fixture directly.
    const remoteBranches = execSync('git branch --list', { cwd: f.bareOrigin }).toString()
    expect(remoteBranches).toContain(result.branch)
  })

  it('preserves the uncommitted file content in the pushed branch', async () => {
    const f = makeFixture()
    writeFileSync(join(f.worktree, 'uncommitted.txt'), 'the 1070 correct lines\n')
    const result = await salvageUncommittedWork(f.worktree, f.branch)
    const showOutput = execSync(`git show ${result.branch}:uncommitted.txt`, { cwd: f.bareOrigin }).toString()
    expect(showOutput).toBe('the 1070 correct lines\n')
  })
})

describe('destroyWorktree', () => {
  it('removes the worktree directory and deregisters it from the repo', async () => {
    const f = makeFixture()
    expect(existsSync(f.worktree)).toBe(true)
    await destroyWorktree(f.worktree)
    expect(existsSync(f.worktree)).toBe(false)
    const list = execSync('git worktree list', { cwd: f.mainRepo }).toString()
    expect(list).not.toContain(f.worktree)
  })

  it('removes a worktree even after it was checked out onto a fresh salvage branch (dirty from the main repo\'s view)', async () => {
    const f = makeFixture()
    writeFileSync(join(f.worktree, 'uncommitted.txt'), 'x\n')
    await salvageUncommittedWork(f.worktree, f.branch)
    await expect(destroyWorktree(f.worktree)).resolves.toBeUndefined()
    expect(existsSync(f.worktree)).toBe(false)
  })
})

describe('labelIssue', () => {
  it('calls gh issue edit with --add-label', async () => {
    await labelIssue('42', 'fleet:merged')
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh', expect.arrayContaining(['issue', 'edit', '42', '--add-label', 'fleet:merged']), expect.anything(),
    )
  })
})

describe('settle', () => {
  it('stops the session, salvages, destroys the worktree, and labels the issue, in that order, on success', async () => {
    const f = makeFixture()
    writeFileSync(join(f.worktree, 'uncommitted.txt'), 'salvage me\n')
    const log = vi.fn()

    await settle({ name: 'fleet-ios-1', itemId: '1', outcome: 'SUCCESS', worktree: f.worktree, branch: f.branch }, log)

    // Ordering: tmux kill-session must be the FIRST mocked call, and the
    // gh label call must be the LAST — with the real git salvage/destroy
    // calls (not visible on the mock) happening in between. This is the
    // "salvage before destroy" property, made observable: if destroy ran
    // before salvage, the worktree directory would already be gone by the
    // time salvageUncommittedWork tried to read its status, and salvage
    // would throw instead of succeeding.
    expect(mockExecFile.mock.calls[0]?.[0]).toBe('tmux')
    const ghCallIndex = mockExecFile.mock.calls.findIndex((c) => c[0] === 'gh')
    expect(ghCallIndex).toBe(mockExecFile.mock.calls.length - 1)
    expect(existsSync(f.worktree)).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('salvaged uncommitted work'))
  })

  it('destroys the worktree on a FAILED outcome too', async () => {
    const f = makeFixture()
    const log = vi.fn()
    await settle({ name: 'fleet-ios-1', itemId: '1', outcome: 'FAILED', worktree: f.worktree, branch: f.branch }, log)
    expect(existsSync(f.worktree)).toBe(false)
  })

  it('does NOT destroy the worktree when salvage itself fails — teardown must not run ahead of a failed salvage', async () => {
    const f = makeFixture()
    writeFileSync(join(f.worktree, 'uncommitted.txt'), 'at risk\n')
    // git calls in this suite pass straight through to the REAL execFile (see
    // the vi.mock factory above), so the push leg is broken authentically —
    // by pointing origin at a path that cannot receive a push — rather than
    // by intercepting the call. checkout/add/commit still succeed against the
    // real local repo (proving there IS uncommitted work worth salvaging);
    // only the push, the step that actually gets it out of the doomed
    // worktree, fails.
    execSync(`git remote set-url origin ${join(tmpdir(), 'llamenos-fleet-nonexistent-origin')}`, { cwd: f.worktree })
    const log = vi.fn()
    await settle({ name: 'fleet-ios-1', itemId: '1', outcome: 'BLOCKED', worktree: f.worktree, branch: f.branch }, log)
    expect(existsSync(f.worktree)).toBe(true)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('refusing to destroy the worktree'))
  })

  it('skips worktree steps entirely when no worktree is known, but still labels the issue', async () => {
    const log = vi.fn()
    await settle({ name: 'fleet-ios-1', itemId: '1', outcome: 'REJECTED' }, log)
    const ghCall = mockExecFile.mock.calls.find((c) => c[0] === 'gh')
    expect(ghCall?.[1]).toEqual(expect.arrayContaining(['fleet:rejected']))
  })

  it('applies no label for an outcome with none mapped (e.g. SHADOW, DISPATCHED)', async () => {
    const log = vi.fn()
    await settle({ name: 'fleet-ios-1', itemId: '1', outcome: 'SHADOW' }, log)
    const ghCall = mockExecFile.mock.calls.find((c) => c[0] === 'gh')
    expect(ghCall).toBeUndefined()
  })
})
