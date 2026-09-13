import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve as resolvePath, sep } from 'node:path'
import { checkScope } from './scope.js'
import { classifyImpact } from './impact.js'
import { NEVER_WRITE_PATHS } from './config.js'
import type { Lane } from './config.js'

const execFileAsync = promisify(execFile)

export interface VerifyInput {
  /**
   * Where git runs. This must be a TRUSTED checkout: in CI it is the PR's
   * BASE commit, never the head. Everything this function decides — the
   * changed-file list, and therefore scope, never-write and impact — is
   * computed by git here, from repository history, with no code from the
   * commit under judgement executing anywhere.
   */
  worktree: string
  /** The right-hand side of the diff range. In CI this is the PR's head SHA,
   *  fetched into the base checkout as an object — not checked out. */
  branch: string
  /** The left-hand side of the diff range. Defaults to `origin/main`; CI
   *  passes the PR's base SHA so the range is exactly the PR's own change. */
  base?: string
  lane: Lane
  /**
   * Scope and impact only — used by the `fleet/review` CI job, where
   * `fleet/verify` is the job that runs the diff-targeted tests and running
   * them a second time buys no extra signal. A report produced this way has
   * `testsRun: []` and `testsPassed: undefined`, so it can never be mistaken
   * for one whose tests passed: `buildGateTrace` renders it `tests=none`.
   */
  skipTests?: boolean
  /**
   * Where the diff-targeted tests run, and the ONLY place code from the
   * commit under judgement is ever executed. Defaults to `worktree` (the
   * fleet's own worker on the operator's box, where the two are the same
   * tree). CI passes a `git archive` export of the head instead, so the
   * tests run against the PR's files while every DECISION above was already
   * made from the base checkout.
   */
  testDir?: string
}

export interface VerifyReport {
  passed: boolean
  reasons: string[]
  changedFiles: string[]
  addedLines: number
  impact: 'low' | 'high'
  impactReasons: string[]
  testsRun?: string[]
  testsPassed?: boolean
  /**
   * The exact commit this report examined: the resolved right-hand side of
   * the diff range, captured once, up front. It no longer has to be compared
   * against anything at merge time: a commit status is attached to ONE SHA,
   * so GitHub itself refuses to merge a head that does not carry its own
   * green `fleet/verify`. It survives as the `sha=` field of the gate trace,
   * which `llamenos-fleet status <issue>` reads back. `undefined` only when
   * `git rev-parse` itself failed — which already implies `passed: false`.
   */
  verifiedCommit?: string
}

/** Parses `git diff --name-only` output. Blank lines (a trailing newline, or
 *  one stray in the middle) are dropped rather than kept as an empty-string
 *  "changed file" that would then vacuously match every glob. */
export function changedFilesFrom(diffNameOnly: string): string[] {
  return diffNameOnly.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
}

/**
 * Counts added lines in a unified diff. The `+++ b/file` header line starts
 * with `+` exactly like an added line does, so it must be excluded first —
 * counting it would inflate every file's added-line count by one and, on a
 * diff with many touched files, could tip a diff over LARGE_DIFF_LINES that
 * never actually earned it.
 *
 * Fix-round finding (V3): excluding EVERY line that starts with `+++`,
 * anywhere in the text, also swallows a genuinely added line whose content
 * happens to begin with `++` at column zero — plausible in this repo, which
 * commits `.diff` fixtures. The header is only ever the file's `+++ b/file`
 * line, which unified diff format always emits directly after that file's
 * `--- a/file` line — so the header is identified POSITIONALLY (the line
 * right after a `--- ` line), not by pattern-matching its content against
 * every line in the diff.
 */
export function addedLinesFrom(diffText: string): number {
  let n = 0
  const lines = diffText.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const prev = lines[i - 1]
    const isFileHeaderLine = prev !== undefined && prev.startsWith('--- ') && line.startsWith('+++ ')
    if (isFileHeaderLine) continue
    if (line.startsWith('+')) n++
  }
  return n
}

interface TestRoute { prefix: string; config: string; target: string }

/**
 * Diff-targeted, not whole-repo: a route maps a changed path prefix to the
 * ONE vitest config + filter argument that covers it, so verifyMechanical
 * runs only the suite relevant to what the worker actually touched. Order
 * matters only in that both orchestrator source and its own tests route to
 * the same fleet suite — a worker's change to `tests/orchestrator/*.test.ts`
 * must re-run the fleet suite exactly as a change to `orchestrator/src/*.ts`
 * would, not silently skip verification because the path prefix looked like
 * "just tests".
 */
const TEST_ROUTES: readonly TestRoute[] = [
  { prefix: 'tests/orchestrator/', config: 'vitest.orchestrator.config.ts', target: 'orchestrator' },
  { prefix: 'orchestrator/', config: 'vitest.orchestrator.config.ts', target: 'orchestrator' },
  { prefix: 'apps/worker/', config: 'vitest.unit.config.ts', target: 'apps/worker' },
]

function routesFor(changed: string[]): TestRoute[] {
  const seen = new Set<string>()
  const out: TestRoute[] = []
  for (const f of changed) {
    for (const r of TEST_ROUTES) {
      if (f.startsWith(r.prefix) && !seen.has(r.target)) {
        seen.add(r.target)
        out.push(r)
      }
    }
  }
  return out
}

/**
 * Maps changed files to the test suites they touch. Deliberately returns `[]`
 * — never `['.']` or any other whole-suite sentinel — when nothing maps: a
 * README-only diff has no suite to run, and falling back to "everything" is
 * exactly the slow, diff-irrelevant behaviour this function exists to avoid.
 */
export function testTargetsFor(changed: string[]): string[] {
  return routesFor(changed).map((r) => r.target)
}

/**
 * Atlas's scar, made mechanical: a previous version of this gate built a
 * `bash -lc` string out of worker-authored filenames, so a committed file
 * named `$(...)` would have executed inside the process holding every
 * credential the orchestrator has. `verifyMechanical` only ever runs test
 * targets via `execFile` argv — never a shell — which already closes that
 * hole for command substitution. This check is the belt-and-suspenders
 * layer on top: even without shell interpretation, a leading `-` can still
 * be read as a CLI flag by the test runner itself (silently disabling
 * coverage, or worse), and `..` can walk a "test target" outside the repo
 * entirely. Restricting to an allowlisted character set removes every shell
 * metacharacter as a possibility too, so a future refactor that starts
 * deriving targets from diff content — rather than this file's fixed,
 * hardcoded route table — does not reopen the hole by accident. Treat this
 * as load-bearing, not defensive.
 *
 * Fix-round finding (V2): the original character-class allowlist accepted a
 * LEADING `/` — `/etc/passwd` has no `-`, no `..`, and every character it
 * contains is in `[A-Za-z0-9_./-]`, so it passed. An absolute path is never
 * a legitimate test target (every real one is relative to the worktree), so
 * it is now rejected outright. On top of that, when a `repoRoot` is given,
 * the path is resolved against it and the result must land INSIDE that
 * root — checked with a trailing separator (`root + sep`), not a bare
 * `startsWith(root)`, because a bare prefix check would wrongly accept a
 * sibling directory that merely shares a string prefix with the root (e.g.
 * root `/repo` and target `/repo-evil/x`). `repoRoot` is optional so this
 * function stays usable as a pure syntactic check wherever no filesystem
 * context is available.
 */
const SAFE_TEST_PATH_RE = /^[A-Za-z0-9_./-]+$/

/**
 * Exported separately from `isSafeTestPath` so the separator-safe boundary
 * math is directly unit-testable on its own: `isSafeTestPath`'s earlier
 * leading-`/` rejection already refuses every absolute `p`, which would
 * otherwise make a bare `startsWith(root)` bug (accepting the sibling
 * `/repo-evil` as if it were inside `/repo`) unreachable through
 * `isSafeTestPath` alone and therefore invisible to a test suite that only
 * calls the public function.
 */
export function resolvesWithinRoot(root: string, p: string): boolean {
  const absRoot = resolvePath(root)
  const resolved = resolvePath(absRoot, p)
  return resolved === absRoot || resolved.startsWith(absRoot + sep)
}

export function isSafeTestPath(p: string, repoRoot?: string): boolean {
  if (p.length === 0) return false
  if (p.startsWith('-')) return false
  if (p.startsWith('/')) return false
  if (p.includes('..')) return false
  if (!SAFE_TEST_PATH_RE.test(p)) return false
  if (repoRoot !== undefined && !resolvesWithinRoot(repoRoot, p)) return false
  return true
}

async function runGit(worktree: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', worktree, ...args], {
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
  } catch {
    return undefined
  }
}

interface TestRunResult { exitCode: number; output: string }

async function runVitestTarget(worktree: string, route: TestRoute): Promise<TestRunResult> {
  if (!isSafeTestPath(route.target, worktree)) {
    // Should be unreachable — every target above comes from the fixed
    // TEST_ROUTES table, never from diff content — but a gate that trusts
    // its own invariants is exactly how the reference system's hole opened.
    throw new Error(`refusing to run unsafe test target: ${JSON.stringify(route.target)}`)
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      'bunx',
      ['vitest', 'run', '--config', route.config, route.target],
      { cwd: worktree, timeout: 10 * 60_000, maxBuffer: 32 * 1024 * 1024 },
    )
    return { exitCode: 0, output: `${stdout}${stderr}` }
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: typeof err.code === 'number' ? err.code : 1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    }
  }
}

/** Vitest's default text reporter prints a summary line like
 *  `     Tests  2 failed | 15 passed (17)`. Returns `undefined`, not 0, when
 *  no such line is found — 0 real failures and "could not parse" must stay
 *  distinguishable, since the whole point of step 5 below is telling them
 *  apart. */
function parseFailingCount(output: string): number | undefined {
  const m = /Tests\s+(\d+)\s+failed/i.exec(output)
  if (!m) return undefined
  return Number(m[1])
}

/**
 * Order is the design, not a style choice:
 *
 * 1. Scope — any forbidden or strayed file is an immediate fail, naming the
 *    offenders. `checkScope` and `classifyImpact` have had no runtime caller
 *    until this function; this is what wires them in.
 * 2. Impact — recorded on the report, never itself a fail, and no longer a
 *    gate anywhere: a diff touching a sensitive path is held by GitHub's own
 *    "require review from Code Owners" rule against `CODEOWNERS`, not by
 *    this process. `classifyImpact` survives to DESCRIBE a diff (the trace,
 *    the digest, the reviewer's turn budget), never to decide about it.
 * 3. Diff-targeted tests only, run by argv via `execFile` — never a shell,
 *    never the whole suite (slow, produces failures unrelated to the diff,
 *    and CI already shards it).
 * 4. A non-zero test exit with zero parsed failing assertions is
 *    infrastructure, not a code failure: warn via `reasons`, leave
 *    `testsPassed` undefined, and do not fail `passed` on it alone.
 */
export async function verifyMechanical(input: VerifyInput): Promise<VerifyReport> {
  const { worktree, branch, lane } = input
  const range = `${input.base ?? 'origin/main'}...${branch}`
  const testRoot = input.testDir ?? worktree

  // Captured FIRST and once: the commit under judgement — the RIGHT-HAND
  // side of the range, resolved, not the worktree's own HEAD. Those are the
  // same thing on the operator's box, where the worktree is checked out on
  // the branch being verified. They are NOT the same in CI, where git runs
  // in the trusted BASE checkout and the commit being judged is only an
  // object in it: `rev-parse HEAD` there names the base, so the trace would
  // have identified the wrong commit entirely — and `status.ts` reads this
  // field back as "the commit this report examined".
  const headShaRaw = await runGit(worktree, ['rev-parse', branch])
  if (headShaRaw === undefined) {
    return {
      passed: false,
      reasons: [`could not resolve HEAD in ${worktree} — git rev-parse failed`],
      changedFiles: [],
      addedLines: 0,
      impact: 'low',
      impactReasons: [],
    }
  }
  const verifiedCommit = headShaRaw.trim()

  const nameOnly = await runGit(worktree, ['diff', '--name-only', range])
  if (nameOnly === undefined) {
    return {
      passed: false,
      reasons: [`could not compute the diff against origin/main for ${branch} — git diff failed`],
      changedFiles: [],
      addedLines: 0,
      impact: 'low',
      impactReasons: [],
      verifiedCommit,
    }
  }

  const fullDiff = await runGit(worktree, ['diff', range])
  const changedFiles = changedFilesFrom(nameOnly)
  const addedLines = addedLinesFrom(fullDiff ?? '')

  const reasons: string[] = []
  const { forbidden, strayed } = checkScope(changedFiles, lane.scope, [...NEVER_WRITE_PATHS])
  if (forbidden.length > 0) {
    reasons.push(`touched never-write paths: ${forbidden.join(', ')}`)
  }
  if (strayed.length > 0) {
    reasons.push(`touched files outside lane "${lane.id}"'s scope: ${strayed.join(', ')}`)
  }
  const scopeFailed = forbidden.length > 0 || strayed.length > 0

  const { impact, reasons: impactReasons } = classifyImpact(changedFiles, addedLines)

  // Scope failure is immediate and unconditional: do not spend time running
  // tests for a diff that already touched what it must not have.
  if (scopeFailed) {
    return { passed: false, reasons, changedFiles, addedLines, impact, impactReasons, verifiedCommit }
  }

  const routes = input.skipTests === true ? [] : routesFor(changedFiles)
  const testsRun = routes.map((r) => r.target)
  let testsPassed: boolean | undefined

  if (routes.length > 0) {
    let sawParsedFailure = false
    let sawUnparsedNonZero = false
    for (const route of routes) {
      const result = await runVitestTarget(testRoot, route)
      const failingCount = parseFailingCount(result.output)
      if (failingCount !== undefined && failingCount > 0) {
        sawParsedFailure = true
      } else if (result.exitCode !== 0) {
        sawUnparsedNonZero = true
      }
    }
    if (sawParsedFailure) {
      testsPassed = false
      reasons.push('diff-targeted tests failed')
    } else if (sawUnparsedNonZero) {
      testsPassed = undefined
      reasons.push(
        'a test runner exited non-zero but no failing assertions could be parsed from its output — ' +
        'treated as infrastructure failure, not a code failure; not blocking on this alone',
      )
    } else {
      testsPassed = true
    }
  }

  return {
    passed: !scopeFailed && testsPassed !== false,
    reasons,
    changedFiles,
    addedLines,
    impact,
    impactReasons,
    testsRun,
    testsPassed,
    verifiedCommit,
  }
}
