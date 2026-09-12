import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  changedFilesFrom, addedLinesFrom, testTargetsFor, isSafeTestPath, resolvesWithinRoot, verifyMechanical,
} from '../../orchestrator/src/verify.js'
import type { Lane } from '../../orchestrator/src/config.js'

describe('changedFilesFrom', () => {
  it('splits git diff --name-only output', () => {
    expect(changedFilesFrom('a/b.ts\nc/d.ts\n')).toEqual(['a/b.ts', 'c/d.ts'])
  })
  it('returns [] for empty output', () => {
    expect(changedFilesFrom('')).toEqual([])
  })
  it('ignores blank lines in the middle of the output', () => {
    expect(changedFilesFrom('a/b.ts\n\nc/d.ts\n')).toEqual(['a/b.ts', 'c/d.ts'])
  })
})

describe('addedLinesFrom', () => {
  it('counts added lines and ignores the +++ header', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '@@', '+one', '+two', '-gone', ' same'].join('\n')
    expect(addedLinesFrom(diff)).toBe(2)
  })
  it('does not count the --- header as a removed line miscounted as added', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts'].join('\n')
    expect(addedLinesFrom(diff)).toBe(0)
  })
  it('returns 0 for empty diff text', () => {
    expect(addedLinesFrom('')).toBe(0)
  })
  // V3 (fix round 1): a line starting with `+++` is only the file header
  // when it directly follows a `--- ` line — anywhere else it is real
  // content (this repo commits `.diff` fixtures, so this is not academic).
  it('counts an added line that itself begins with "+++" when it is not the file header', () => {
    const diff = [
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,3 @@',
      ' context',
      '+++not a real header, just content that happens to start with plus plus plus',
      '+another add',
    ].join('\n')
    expect(addedLinesFrom(diff)).toBe(2)
  })
  it('still excludes the header when the diff touches multiple files', () => {
    const diff = [
      '--- a/one.ts', '+++ b/one.ts', '@@', '+a',
      '--- a/two.ts', '+++ b/two.ts', '@@', '+b', '+c',
    ].join('\n')
    expect(addedLinesFrom(diff)).toBe(3)
  })
})

describe('isSafeTestPath', () => {
  it.each(['-rf', '../etc/passwd', 'a$(whoami)b', 'a;rm -rf /', 'a`id`b'])(
    'rejects %s', (p) => expect(isSafeTestPath(p)).toBe(false))
  it.each(['tests/orchestrator', 'apps/worker/__tests__/unit'])(
    'accepts %s', (p) => expect(isSafeTestPath(p)).toBe(true))
  it('rejects an absolute path masquerading as a leading dash-free string with a shell metacharacter', () => {
    expect(isSafeTestPath('tests/orch|rm -rf ~')).toBe(false)
  })
  it('rejects a path containing a space-separated flag injection', () => {
    expect(isSafeTestPath('tests/orch --coverage=false')).toBe(false)
  })

  // --- V2 (fix round 1): leading-'/' and repoRoot-boundary hardening ---

  it('rejects an absolute path with no ".." and no leading dash', () => {
    expect(isSafeTestPath('/etc/passwd')).toBe(false)
  })
  it('rejects any absolute path, even a plausible-looking one', () => {
    expect(isSafeTestPath('/tmp/x')).toBe(false)
  })
  it('rejects an absolute path that shares a string prefix with the repo root without being inside it', () => {
    // Demonstrates why the boundary check must be `startsWith(root + sep)`,
    // not a bare `startsWith(root)`: '/repo-evil' is a sibling of '/repo',
    // not a path inside it, even though the plain string "starts with" it.
    expect(isSafeTestPath('/repo-evil/malicious.test.ts', '/repo')).toBe(false)
  })
  it('accepts a relative target that resolves inside the given repoRoot', () => {
    expect(isSafeTestPath('apps/worker', '/repo')).toBe(true)
  })
  it('accepts a relative target nested under a nested repoRoot (sanity check on the boundary math)', () => {
    expect(isSafeTestPath('sibling', '/repo/nested')).toBe(true)
  })
})

describe('resolvesWithinRoot', () => {
  // isSafeTestPath's own leading-'/' rejection makes an absolute-path
  // sibling escape unreachable through the public function alone — these
  // exercise the separator-boundary math directly, independent of that
  // earlier gate, so a regression here cannot hide behind it.
  it('accepts a relative path nested under root', () => {
    expect(resolvesWithinRoot('/repo', 'apps/worker')).toBe(true)
  })
  it('accepts root itself', () => {
    expect(resolvesWithinRoot('/repo', '.')).toBe(true)
  })
  it('rejects a sibling directory that merely shares a string prefix with root', () => {
    expect(resolvesWithinRoot('/repo', '/repo-evil/x')).toBe(false)
  })
})

describe('testTargetsFor', () => {
  it('maps worker changes to the worker unit suite', () => {
    expect(testTargetsFor(['apps/worker/lib/auth.ts']).join(' ')).toMatch(/worker/)
  })
  it('maps orchestrator changes to the fleet suite', () => {
    expect(testTargetsFor(['orchestrator/src/tick.ts']).join(' ')).toMatch(/orchestrator/)
  })
  it('maps a change to the orchestrator tests themselves to the fleet suite', () => {
    expect(testTargetsFor(['tests/orchestrator/tick.test.ts']).join(' ')).toMatch(/orchestrator/)
  })
  it('never returns the whole suite', () => {
    expect(testTargetsFor(['apps/worker/a.ts', 'src/client/b.tsx'])).not.toContain('.')
  })
  it('returns [] when nothing maps, rather than falling back to everything', () => {
    expect(testTargetsFor(['README.md'])).toEqual([])
  })
  it('deduplicates when multiple changed files map to the same target', () => {
    const targets = testTargetsFor(['apps/worker/a.ts', 'apps/worker/b.ts'])
    expect(targets.length).toBe(new Set(targets).size)
  })
})

// --- W1 (fix round 2): verifiedCommit must be a RECORD of the tree that was
// actually examined, not something re-derivable later. Exercised against a
// real temporary git repo so this is checking verifyMechanical's actual
// wiring, not a mock's say-so.

describe('verifyMechanical', () => {
  const createdRepos: string[] = []

  afterEach(() => {
    while (createdRepos.length > 0) {
      const dir = createdRepos.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeRepoWithDivergedMain(): { dir: string; headSha: string; originMainSha: string } {
    const dir = mkdtempSync(join(tmpdir(), 'llamenos-fleet-verify-test-'))
    createdRepos.push(dir)
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@example.com', { cwd: dir })
    execSync('git config user.name "Test"', { cwd: dir })
    writeFileSync(join(dir, 'notes.md'), 'first\n')
    execSync('git add notes.md', { cwd: dir })
    execSync('git commit -q -m initial', { cwd: dir })
    const originMainSha = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim()
    // A local ref standing in for a fetched `origin/main`, without needing
    // an actual remote — verifyMechanical only reads it as a ref.
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', originMainSha], { cwd: dir })

    writeFileSync(join(dir, 'notes.md'), 'first\nsecond\n')
    execSync('git add notes.md', { cwd: dir })
    execSync('git commit -q -m "add a note"', { cwd: dir })
    const headSha = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim()

    return { dir, headSha, originMainSha }
  }

  const testLane: Lane = {
    id: 'test', mode: 'live', cap: 1, engine: 'claude',
    requireLabel: 'agent-dispatchable', vetoLabels: [],
    scope: { owned: ['notes.md'], notOwned: [] },
  }

  it('records the exact commit examined as verifiedCommit', async () => {
    const { dir, headSha, originMainSha } = makeRepoWithDivergedMain()
    const report = await verifyMechanical({ worktree: dir, branch: 'main', lane: testLane })

    expect(report.verifiedCommit).toBe(headSha)
    // Sanity: it is genuinely HEAD, not the base it diffed against.
    expect(report.verifiedCommit).not.toBe(originMainSha)
  })

  it('still records verifiedCommit even when scope verification fails', () => {
    // A record of what was examined must exist regardless of the verdict —
    // an auditor asking "what commit did this failing report even look at"
    // must get an answer, not undefined-because-it-failed-early.
    return (async () => {
      const { dir, headSha } = makeRepoWithDivergedMain()
      const outOfScopeLane: Lane = { ...testLane, scope: { owned: ['some-other-file.md'], notOwned: [] } }
      const report = await verifyMechanical({ worktree: dir, branch: 'main', lane: outOfScopeLane })

      expect(report.passed).toBe(false)
      expect(report.verifiedCommit).toBe(headSha)
    })()
  })
})
