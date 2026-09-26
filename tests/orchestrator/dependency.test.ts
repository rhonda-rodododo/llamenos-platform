import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { problemsWith, rulesReferenceDeadCommands, gitFactsFor } from '../../orchestrator/src/dependency.js'

// The three checks that used to live here — the script exists and is
// executable, its rules avoid dead commands, and its directory is a real
// git repo — all read `DISPATCH_SCRIPT`/`DISPATCH_SKILL_DIR`, which resolve
// under the real `homedir()` (see paths.ts) and point at
// `~/.claude/skills/supervising-dispatched-sessions`, a path that exists
// only on an operator's machine, not in this repo or on a CI runner. They
// asserted the state of the developer's machine, not the state of the code,
// so they could only ever fail on a runner that has never seen that
// directory. `doctor` (orchestrator/src/cli.ts) already reports this
// dependency's path, HEAD commit and any problems at runtime, which is the
// only place the answer is meaningful. What remains below is the part with
// durable value: `problemsWith` and `gitFactsFor` are pure functions over
// data, and `rulesReferenceDeadCommands` is a pure function over text —
// none of them touch the filesystem outside of temp dirs they create and
// clean up themselves.

describe('dispatch dependency', () => {
  it('reports a dirty dependency repo as a problem', () => {
    expect(problemsWith({ exists: true, executable: true, isGitRepo: true, dirty: true, rulesClean: true }))
      .toContainEqual(expect.stringMatching(/uncommitted/i))
  })

  it('reports a missing script as a problem', () => {
    expect(problemsWith({ exists: false, executable: false, isGitRepo: true, dirty: false, rulesClean: true }).length)
      .toBeGreaterThan(0)
  })

  it('reports no problems when everything is in order', () => {
    expect(problemsWith({ exists: true, executable: true, isGitRepo: true, dirty: false, rulesClean: true }))
      .toEqual([])
  })

  it('reports an unreadable repo state as a problem', () => {
    expect(problemsWith({ exists: true, executable: true, isGitRepo: true, dirty: false, rulesClean: true, unreadable: true }))
      .toContainEqual(expect.stringMatching(/could not be fully read/i))
  })
})

describe('gitFactsFor', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  /**
   * The exact failure mode H2 guards against: `git rev-parse HEAD` throws on
   * a repo with zero commits ("fatal: ambiguous argument 'HEAD'") even
   * though `git rev-parse --is-inside-work-tree` and `git status --porcelain`
   * both succeed fine. Before the fix, this threw straight out of
   * gitFactsFor/checkDispatchDependency instead of being reported.
   */
  it('reports unreadable (not throw) for a git repo with zero commits', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-dep-zero-commit-'))
    dirs.push(dir)
    execFileSync('git', ['-C', dir, 'init', '--quiet'])
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'])
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'])

    let facts: ReturnType<typeof gitFactsFor> | undefined
    expect(() => { facts = gitFactsFor(dir) }).not.toThrow()
    expect(facts?.isGitRepo).toBe(true)
    expect(facts?.unreadable).toBe(true)
    expect(facts?.commit).toBeUndefined()
  })

  it('reports a normal, committed, clean repo as fully readable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-dep-clean-'))
    dirs.push(dir)
    execFileSync('git', ['-C', dir, 'init', '--quiet'])
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'])
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'])
    execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '--quiet', '-m', 'init'])

    const facts = gitFactsFor(dir)
    expect(facts.isGitRepo).toBe(true)
    expect(facts.unreadable).toBe(false)
    expect(facts.dirty).toBe(false)
    expect(facts.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('reports a non-git directory as not a git repo, not as unreadable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-dep-notgit-'))
    dirs.push(dir)
    const facts = gitFactsFor(dir)
    expect(facts.isGitRepo).toBe(false)
    expect(facts.unreadable).toBe(false)
  })
})

describe('rulesReferenceDeadCommands', () => {
  it('flags a fenced command naming dev:docker', () => {
    expect(rulesReferenceDeadCommands('```bash\nbun run dev:docker\n```')).toBe(true)
  })
  it('flags a fenced command naming test:unit', () => {
    expect(rulesReferenceDeadCommands('```bash\nbun run test:unit\n```')).toBe(true)
  })
  it('flags a fenced command referencing the retired sibling repo', () => {
    expect(rulesReferenceDeadCommands('```bash\nDISPATCH_REPO=$WORKTREE_BASE/llamenos-hotline\n```')).toBe(true)
  })
  it('does not flag prose that merely names the retired repo to warn workers away from it', () => {
    expect(rulesReferenceDeadCommands('it is a different repo from the retired `llamenos-hotline` v1 project')).toBe(false)
  })
  it('does not flag clean fenced commands', () => {
    expect(rulesReferenceDeadCommands('```bash\nbun run test:worker:unit\n```')).toBe(false)
  })
})
