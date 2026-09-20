import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for the "Export the PR head as data" step in fleet-review.yml
 * silently swallowing the one thing this step exists to prevent: a `.git`
 * object database surviving into the export the reviewer reads.
 *
 * Before this fix, the check was a bare `test ! -e "$RUNNER_TEMP/head/.git"`
 * with no surrounding `if`. GitHub runs an unshelled `run:` step as
 * `bash -e {0}`, and this step's own `set -euo pipefail` does not change
 * that. `test` failing (i.e. the `.git` DOES exist — the exact case this
 * line exists to catch) is itself a failing simple command under `-e`: the
 * script would die on that line with ZERO output — no `::error::`, no
 * reason, nothing — while every OTHER failure mode in this same step
 * (`.opencode`/`.claude` surviving the strip, a few lines later) already
 * prints a clear message first. The one invariant this step exists for (the
 * gate never executes the judged commit's own code — see the gate's first
 * catch, #665) was exactly the branch with no diagnostic at all.
 *
 * The fix replaces the bare assertion with an explicit `if [ -e ... ]; then
 * echo ...; exit 1; fi`, carrying the same `fleet/review FAILED:
 * git-export-invariant` marker every other step in this file now uses.
 *
 * Real functional test, not a text/regex rail over the YAML: extracts the
 * step's ACTUAL `run:` script with a YAML parser (so it always tests the
 * literal bytes GitHub would run), substitutes only the network-dependent
 * `git fetch`/`git archive` population (there is no real upstream remote or
 * SHA to fetch in a unit test) for a fixture that plants a poisoned `.git`
 * file directly, and runs every line AFTER that substitution — the guard
 * under test, and the control-file strip beneath it — completely
 * unmodified, exactly as GitHub would execute them.
 */

const FLEET_REVIEW_YML = join(process.cwd(), '.github', 'workflows', 'fleet-review.yml')
const STEP_NAME = 'Export the PR head as data'
const FAILED_MARKER = 'fleet/review FAILED:'
const REASON_TOKEN = 'git-export-invariant'

interface WorkflowStep {
  name?: string
  run?: string
}
interface WorkflowJob {
  steps: WorkflowStep[]
}
interface WorkflowDoc {
  jobs: Record<string, WorkflowJob>
}

/** The step's `run:` block, exactly as GitHub would read it — parsed from
 *  the real YAML, never a hand-copied string that could silently drift from
 *  the file this rail is supposed to guard. */
function exportStepScript(): string {
  const doc = parseYaml(readFileSync(FLEET_REVIEW_YML, 'utf8')) as WorkflowDoc
  const job = doc.jobs['fleet-review']
  if (!job) throw new Error('no "fleet-review" job found in fleet-review.yml — the parser must not pass vacuously')
  const step = job.steps.find((s) => s.name === STEP_NAME)
  if (!step || typeof step.run !== 'string') {
    throw new Error(`no "${STEP_NAME}" step with a run: block found — the parser must not pass vacuously`)
  }
  return step.run
}

/**
 * Swaps the real `git fetch` + `git archive | tar` population (needs a real
 * upstream remote and a real SHA — not available in a unit test) for a
 * fixture that plants a `.git` FILE directly at the same path the real
 * pipeline would have extracted into. Everything from `mkdir -p
 * "$RUNNER_TEMP/head"` onward in the ORIGINAL script — the guard under test
 * and the control-file strip beneath it — is left completely untouched;
 * only the population step ahead of it is substituted.
 */
function withPoisonedGitFixture(script: string): string {
  const needle = 'git fetch --no-tags origin "$HEAD_SHA"\nmkdir -p "$RUNNER_TEMP/head"\ngit archive "$HEAD_SHA" | tar -x -C "$RUNNER_TEMP/head"\n'
  expect(script, 'the git fetch/archive population lines were not found — this mutation is vacuous').toContain(needle)
  return script.replace(needle, 'mkdir -p "$RUNNER_TEMP/head"\ntouch "$RUNNER_TEMP/head/.git"\n')
}

/** The pre-fix shape: reverts the explicit `if [ -e ... ]; then ...; fi`
 *  guard back to the bare `test ! -e ...` assertion it replaced, reproducing
 *  exactly the silent-death defect this rail exists to catch. Asserts the
 *  guard was actually present, so this can never pass vacuously against a
 *  script that already lost it for some other reason. */
function withoutTheFix(script: string): string {
  const guardRe = /if \[ -e "\$RUNNER_TEMP\/head\/\.git" \]; then\n(?:.*\n)*?\s*exit 1\n\s*fi\n/
  const mutated = script.replace(guardRe, 'test ! -e "$RUNNER_TEMP/head/.git"\n')
  expect(mutated, 'the explicit if/exit .git guard was not found — this mutation is vacuous').not.toBe(script)
  return mutated
}

let scratch: string
let runnerTemp: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'llamenos-fleet-review-export-'))
  runnerTemp = join(scratch, 'runner-temp')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** Runs a script body the way GitHub runs an unshelled `run:` step:
 *  `bash -e <file>`. Captures stdout+stderr combined, the way a job log
 *  reads it. `RUNNER_TEMP` is a fresh, empty scratch dir every run — the
 *  script itself creates `$RUNNER_TEMP/head`. */
function runStep(script: string): { status: number | null; output: string } {
  const scriptPath = join(scratch, 'step.sh')
  writeFileSync(scriptPath, script)
  const result = spawnSync('bash', ['-e', scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: runnerTemp, HEAD_SHA: 'deadbeef' },
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

describe('rail: the export-PR-head step must always say why a .git export failed', () => {
  it('finds a non-trivial script to test at all — the parser must not pass vacuously', () => {
    expect(exportStepScript().length).toBeGreaterThan(300)
  })

  it('a .git entry surviving the export reaches an explicit failure, naming the invariant', () => {
    const script = withPoisonedGitFixture(exportStepScript())
    const { status, output } = runStep(script)
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain(REASON_TOKEN)
  })

  // MUTATION GUARD (per "audit gates by breaking them"): reintroduce the
  // exact defect this fix removes — the bare `test ! -e ...` assertion —
  // and prove the step goes back to failing SILENTLY. If this test ever
  // fails to show the marker missing, the test above has stopped being a
  // real rail (e.g. because something else started guarding the check
  // instead) and this file needs to be re-examined, not just re-run.
  it('MUTATION: without the explicit if/exit guard, the same .git leak is swallowed — no marker, no reason', () => {
    const script = withoutTheFix(withPoisonedGitFixture(exportStepScript()))
    const { status, output } = runStep(script)
    expect(status).toBe(1) // still fails — that part was never in question
    expect(output).not.toContain(FAILED_MARKER)
    expect(output).not.toContain(REASON_TOKEN)
  })
})
