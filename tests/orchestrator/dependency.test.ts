import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DISPATCH_SCRIPT, DISPATCH_SKILL_DIR } from '../../orchestrator/src/paths.js'
import { problemsWith, rulesReferenceDeadCommands, gitFactsFor } from '../../orchestrator/src/dependency.js'

describe('dispatch dependency', () => {
  it('the script exists and is executable', () => {
    expect(existsSync(DISPATCH_SCRIPT)).toBe(true)
    expect(statSync(DISPATCH_SCRIPT).mode & 0o111).toBeGreaterThan(0)
  })

  /**
   * The naive form of this check — `grep -rn 'llamenos-hotline' <file>` — is a
   * false positive on this exact file: `prompt-rules-llamenos.md`'s own intro
   * paragraph names the retired repo ONLY to warn workers not to mix it up
   * ("it is a different repo from the retired `llamenos-hotline` v1 project;
   * do not mix their paths, remotes, or scripts"). That sentence is the fix,
   * not the bug. The actual risk this test guards is a worker being handed a
   * runnable command that targets a repo or script that does not exist here,
   * so it inspects fenced code blocks only — the same scope
   * `rulesReferenceDeadCommands` (dependency.ts) checks at runtime — and
   * ignores prose. Kept as a real filesystem read (not a fixture) because the
   * fact under test is the live state of a repo outside this one; a fixture
   * would only ever prove the parser works, not that the dependency is clean.
   */
  it('its rules do not name commands this repo does not have', () => {
    const text = readFileSync(`${DISPATCH_SKILL_DIR}/prompt-rules-llamenos.md`, 'utf8')
    expect(rulesReferenceDeadCommands(text), 'worker rules reference a command or repo that does not exist here').toBe(false)
  })

  it('the dependency directory is a real git repository', () => {
    expect(() => execFileSync('git', ['-C', DISPATCH_SKILL_DIR, 'rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' }))
      .not.toThrow()
  })

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
    expect(rulesReferenceDeadCommands('```bash\nDISPATCH_REPO=/media/rikki/Main/projects/llamenos-hotline\n```')).toBe(true)
  })
  it('does not flag prose that merely names the retired repo to warn workers away from it', () => {
    expect(rulesReferenceDeadCommands('it is a different repo from the retired `llamenos-hotline` v1 project')).toBe(false)
  })
  it('does not flag clean fenced commands', () => {
    expect(rulesReferenceDeadCommands('```bash\nbun run test:worker:unit\n```')).toBe(false)
  })
})
