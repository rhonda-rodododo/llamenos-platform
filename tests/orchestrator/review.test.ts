import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseVerdict, verifierFor } from '../../orchestrator/src/review.js'

describe('verifierFor', () => {
  it('never returns the author engine', () => {
    expect(verifierFor('claude')).not.toBe('claude')
    expect(verifierFor('opencode')).not.toBe('opencode')
  })
  it('is the OTHER engine specifically, not an arbitrary third value', () => {
    expect(verifierFor('claude')).toBe('opencode')
    expect(verifierFor('opencode')).toBe('claude')
  })
})

describe('parseVerdict', () => {
  it('reads an explicit PASS', () => {
    expect(parseVerdict('SCOPE: ok\nVERDICT: PASS')).toBe('PASS')
  })
  it('reads an explicit FAIL', () => {
    expect(parseVerdict('VERDICT: FAIL — touched files outside its lane')).toBe('FAIL')
  })
  it('treats a missing verdict as UNREADABLE, not as a pass', () => {
    expect(parseVerdict('I think it looks fine honestly')).toBe('UNREADABLE')
  })
  it('treats empty output as UNREADABLE', () => {
    expect(parseVerdict('')).toBe('UNREADABLE')
  })
  it('is case-insensitive and tolerates leading whitespace', () => {
    expect(parseVerdict('  verdict: pass')).toBe('PASS')
  })
  it('does not mistake a mention of the word "pass" without the VERDICT label for a verdict', () => {
    expect(parseVerdict('this diff should pass CI once merged')).toBe('UNREADABLE')
  })
})

// --- I/O-bearing behaviour, mocked at the node:child_process boundary ---

// review.ts (and gh.ts) call `promisify(execFile)` exactly once, at module
// import time. `promisify` decides right then whether the function has a
// `util.promisify.custom` implementation; a bare `vi.fn()` has none, so it
// falls back to treating the mock as callback-style and hangs forever
// waiting for a callback that never comes. The custom hook must therefore
// exist on the mock BEFORE review.ts is ever imported — set inside the
// factory itself, not assigned onto the mock later from within a test.
//
// V1 fix-round tests need `secondOpinion`'s `gitState`/`exportReviewSnapshot`
// calls to run against a REAL git repository (so before/after tamper
// detection and the exported-snapshot's missing `.git` are genuinely
// observable), while the verifier engine's own `claude`/`opencode`
// invocation stays mocked (no real LLM CLI in a unit test). The custom
// hook branches on the binary: `git` passes straight through to the real
// `execFile`; everything else (the verifier binary, `gh`) goes through the
// trackable `vi.fn()` mock. `spawn` (used by `exportReviewSnapshot` for
// `git archive | tar`) is left entirely real.
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

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>

function mockExecFileResolves(stdout: string): void {
  mockExecFile.mockResolvedValue({ stdout, stderr: '' })
}

function mockExecFileRejects(err: unknown): void {
  mockExecFile.mockRejectedValue(err)
}

beforeEach(() => {
  mockExecFile.mockReset()
})

// --- Real temp git repos, standing in for an author's worktree ---

const createdWorktrees: string[] = []

function makeAuthorWorktree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'llamenos-fleet-review-test-'))
  createdWorktrees.push(dir)
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email test@example.com', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  writeFileSync(join(dir, 'file.txt'), 'hello\n')
  execSync('git add file.txt', { cwd: dir })
  execSync('git commit -q -m initial', { cwd: dir })
  return dir
}

afterEach(() => {
  while (createdWorktrees.length > 0) {
    const dir = createdWorktrees.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('secondOpinion', () => {
  it('refuses to review a report that did not pass mechanical verification', async () => {
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    const failedReport = {
      passed: false, reasons: ['strayed'], changedFiles: [], addedLines: 0,
      impact: 'low' as const, impactReasons: [],
    }
    await expect(secondOpinion({
      authorEngine: 'claude', pr: '1', worktree: '/tmp/x', diff: '', report: failedReport,
    })).rejects.toThrow(/did not pass mechanical verification/)
    // And never even attempts to reach an engine for a report that failed.
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('runs the verifier on the OTHER engine\'s binary, never the author\'s', async () => {
    mockExecFileResolves('VERDICT: PASS')
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    const worktree = makeAuthorWorktree()
    const passedReport = {
      passed: true, reasons: [], changedFiles: ['apps/worker/x.ts'], addedLines: 1,
      impact: 'low' as const, impactReasons: [],
    }
    const result = await secondOpinion({
      authorEngine: 'claude', pr: '1', worktree, diff: 'diff', report: passedReport,
    })
    expect(result.verdict).toBe('PASS')
    expect(mockExecFile).toHaveBeenCalledTimes(1)
    const [binary] = mockExecFile.mock.calls[0] as [string, ...unknown[]]
    expect(binary).toBe('opencode') // author was claude, so the verifier must be opencode
  })

  it('treats an unreachable reviewer as UNREADABLE, not a pass', async () => {
    mockExecFileRejects(new Error('spawn ENOENT'))
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    const worktree = makeAuthorWorktree()
    const passedReport = {
      passed: true, reasons: [], changedFiles: [], addedLines: 0,
      impact: 'low' as const, impactReasons: [],
    }
    const result = await secondOpinion({
      authorEngine: 'opencode', pr: '1', worktree, diff: '', report: passedReport,
    })
    expect(result.verdict).toBe('UNREADABLE')
  })

  it('requests more turns for a high-impact diff than a low-impact one', async () => {
    mockExecFileResolves('VERDICT: PASS')
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    const worktree = makeAuthorWorktree()
    const highImpactReport = {
      passed: true, reasons: [], changedFiles: ['packages/crypto/x.rs'], addedLines: 1,
      impact: 'high' as const, impactReasons: ['packages/crypto/x.rs is under high-impact path packages/crypto/'],
    }
    await secondOpinion({ authorEngine: 'opencode', pr: '1', worktree, diff: '', report: highImpactReport })
    const args = mockExecFile.mock.calls[0]?.[1] as string[]
    const idx = args.indexOf('--max-turns')
    expect(idx).toBeGreaterThanOrEqual(0)
    const highImpactTurns = Number(args[idx + 1])

    mockExecFile.mockClear()
    mockExecFileResolves('VERDICT: PASS')
    const lowImpactReport = { ...highImpactReport, impact: 'low' as const, impactReasons: [] }
    await secondOpinion({ authorEngine: 'opencode', pr: '1', worktree, diff: '', report: lowImpactReport })
    const args2 = mockExecFile.mock.calls[0]?.[1] as string[]
    const idx2 = args2.indexOf('--max-turns')
    const lowImpactTurns = Number(args2[idx2 + 1])

    expect(highImpactTurns).toBeGreaterThan(lowImpactTurns)
  })

  // --- V1 fix-round tests: the verifier must be isolated from the author ---

  const okReport = {
    passed: true as const, reasons: [], changedFiles: ['apps/worker/x.ts'], addedLines: 1,
    impact: 'low' as const, impactReasons: [],
  }

  it('never runs the verifier with the author\'s own worktree as cwd', async () => {
    const worktree = makeAuthorWorktree()
    let capturedCwd: string | undefined
    mockExecFile.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      capturedCwd = options.cwd
      return { stdout: 'VERDICT: PASS', stderr: '' }
    })
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    await secondOpinion({ authorEngine: 'claude', pr: '1', worktree, diff: '', report: okReport })

    expect(capturedCwd).toBeDefined()
    expect(capturedCwd).not.toBe(worktree)
  })

  it('exports a scratch directory containing the source files but no .git', async () => {
    const worktree = makeAuthorWorktree()
    let sawFile = false
    let sawGitDir = false
    mockExecFile.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      // Inspected DURING the call, before secondOpinion's `finally` cleans
      // the scratch directory up — by the time the promise resolves back
      // in this test, the directory is already gone.
      if (options.cwd) {
        sawFile = existsSync(join(options.cwd, 'file.txt'))
        sawGitDir = existsSync(join(options.cwd, '.git'))
      }
      return { stdout: 'VERDICT: PASS', stderr: '' }
    })
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    await secondOpinion({ authorEngine: 'claude', pr: '1', worktree, diff: '', report: okReport })

    expect(sawFile).toBe(true)
    expect(sawGitDir).toBe(false)
  })

  it('strips credential-bearing variables from the verifier\'s environment', async () => {
    const worktree = makeAuthorWorktree()
    const originalGhToken = process.env['GH_TOKEN']
    const originalSshSock = process.env['SSH_AUTH_SOCK']
    process.env['GH_TOKEN'] = 'super-secret-token'
    process.env['SSH_AUTH_SOCK'] = '/tmp/agent.sock'
    let capturedEnv: NodeJS.ProcessEnv | undefined
    mockExecFile.mockImplementation((_file: string, _args: string[], options: { env?: NodeJS.ProcessEnv }) => {
      capturedEnv = options.env
      return { stdout: 'VERDICT: PASS', stderr: '' }
    })
    try {
      const { secondOpinion } = await import('../../orchestrator/src/review.js')
      await secondOpinion({ authorEngine: 'claude', pr: '1', worktree, diff: '', report: okReport })
    } finally {
      if (originalGhToken === undefined) delete process.env['GH_TOKEN']
      else process.env['GH_TOKEN'] = originalGhToken
      if (originalSshSock === undefined) delete process.env['SSH_AUTH_SOCK']
      else process.env['SSH_AUTH_SOCK'] = originalSshSock
    }

    expect(capturedEnv).toBeDefined()
    expect(capturedEnv?.['GH_TOKEN']).toBeUndefined()
    expect(capturedEnv?.['SSH_AUTH_SOCK']).toBeUndefined()
    expect(Object.values(capturedEnv ?? {})).not.toContain('super-secret-token')
  })

  it('removes the scratch directory on the success path', async () => {
    const worktree = makeAuthorWorktree()
    let capturedCwd: string | undefined
    mockExecFile.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      capturedCwd = options.cwd
      return { stdout: 'VERDICT: PASS', stderr: '' }
    })
    const { secondOpinion } = await import('../../orchestrator/src/review.js')
    await secondOpinion({ authorEngine: 'claude', pr: '1', worktree, diff: '', report: okReport })

    expect(capturedCwd).toBeDefined()
    expect(existsSync(capturedCwd ?? '')).toBe(false)
  })

  it('removes the scratch directory on the throw path, and fails verification, when the author worktree is tampered with mid-review', async () => {
    const worktree = makeAuthorWorktree()
    let capturedCwd: string | undefined
    mockExecFile.mockImplementation((_file: string, _args: string[], options: { cwd?: string }) => {
      capturedCwd = options.cwd
      // Simulate a verifier (or anything else) mutating the AUTHOR's real
      // worktree while "reviewing" — this must never go undetected, and
      // must never leave the scratch directory behind either.
      appendFileSync(join(worktree, 'file.txt'), 'tampered-by-verifier\n')
      return { stdout: 'VERDICT: PASS', stderr: '' }
    })
    const { secondOpinion } = await import('../../orchestrator/src/review.js')

    // W3 (fix round 2): the message must say plainly that the VERIFIER did
    // this, and that it is a fleet-level problem worth halting for — not
    // just "something changed," which would read like an ordinary flake.
    // A single call/catch, not two separate invocations: a second call
    // against the same (already-tampered) worktree would see identical
    // before/after `git status --porcelain` output and falsely appear
    // untampered on that second call alone.
    let caught: unknown
    try {
      await secondOpinion({ authorEngine: 'claude', pr: '1', worktree, diff: '', report: okReport })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    const message = caught instanceof Error ? caught.message : ''
    expect(message).toMatch(/modified the AUTHOR'S OWN worktree/)
    expect(message).toMatch(/fleet-level trust failure/)

    expect(capturedCwd).toBeDefined()
    expect(existsSync(capturedCwd ?? '')).toBe(false)
  })
})

describe('postReview', () => {
  // The verdict of record is `fleet/review`, a commit status posted by CI.
  // This one is advisory, so it must never be a GitHub REVIEW: an --approve
  // from the fleet is a review GitHub counts, and is one ruleset edit away
  // from being an approval the fleet grants itself.
  it.each(['PASS', 'FAIL', 'UNREADABLE'] as const)('posts %s as a comment, never a review', async (verdict) => {
    mockExecFileResolves('')
    const { postReview } = await import('../../orchestrator/src/review.js')
    await postReview('123', verdict, 'body text')
    const args = mockExecFile.mock.calls[0]?.[1] as string[]
    expect(args.slice(0, 3)).toEqual(['pr', 'comment', '123'])
    expect(args).not.toContain('--approve')
    expect(args).not.toContain('--request-changes')
    expect(args.join(' ')).toContain(verdict)
  })
})
