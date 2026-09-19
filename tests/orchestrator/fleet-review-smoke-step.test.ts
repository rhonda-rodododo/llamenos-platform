import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for the "Smoke-test the review engine" step in fleet-review.yml
 * silently swallowing an engine failure (see the PR that added this file,
 * #872 — updated for #866, which retired `opencode` as the reviewer engine
 * entirely and rewrote this step to invoke `claude` directly instead).
 *
 * Root cause (#872, still the invariant this file guards): GitHub runs a
 * `run:` step with no `shell:` override as `bash -e {0}` — `-e` is active
 * from the moment the script starts. The step's own `set -uo pipefail` does
 * NOT clear an inherited `-e`; it only adds `-u`/`pipefail` on top. Two
 * captures in the step — `run_out="$(... claude ...)"` and
 * `verdict_out="$(... bun -e ...)"` — are UNGUARDED (no `||` after the
 * assignment), so the first one that fails is itself a failing simple
 * command under `-e`: the script would die on that line, before
 * `run_status=$?`/`verdict_status=$?` are ever read, before `classify()`
 * runs, before `fail()` ever prints anything. The fix is `set +e` right
 * after `set -uo pipefail`, clearing the inherited `-e` so both captures
 * reach their own status check and, on failure, `fail()`. #866 replaced the
 * engine underneath this step (opencode → claude) but did not change this
 * shape at all — the same two unguarded captures exist in the claude-based
 * script, so the fix (and this rail) stays required verbatim.
 *
 * This is a real functional test, not a text/regex rail over the YAML: it
 * extracts the step's ACTUAL `run:` script with a YAML parser (so it always
 * tests the literal bytes GitHub would run, and can never drift from a
 * hand-copied snippet), executes it with `bash -e <script>` — the same
 * invocation GitHub uses for an unshelled step — against a fake `claude`
 * binary on PATH, and asserts on the real stdout/stderr and exit code.
 *
 * Reproduced the underlying mechanism first, in isolation (three lines: an
 * assignment from a command that exits 1 under `set -uo pipefail` inside a
 * script invoked as `bash -e`, followed by an echo — the echo never runs).
 * See the PR body for that transcript.
 */

const FLEET_REVIEW_YML = join(process.cwd(), '.github', 'workflows', 'fleet-review.yml')
const STEP_NAME = 'Smoke-test the review engine'
const FAILED_MARKER = 'review engine smoke test FAILED:'

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
function smokeStepScript(): string {
  const doc = parseYaml(readFileSync(FLEET_REVIEW_YML, 'utf8')) as WorkflowDoc
  const job = doc.jobs['fleet-review']
  if (!job) throw new Error('no "fleet-review" job found in fleet-review.yml — the parser must not pass vacuously')
  const step = job.steps.find((s) => s.name === STEP_NAME)
  if (!step || typeof step.run !== 'string') {
    throw new Error(`no "${STEP_NAME}" step with a run: block found — the parser must not pass vacuously`)
  }
  return step.run
}

/** The pre-fix shape: strips the `set +e` line this PR adds, reproducing
 *  exactly the defect (inherited `-e` from GitHub's `bash -e {0}` never
 *  cleared). Asserts the line was actually present, so this can never pass
 *  vacuously against a script that already dropped it for some other
 *  reason. */
function withoutTheFix(script: string): string {
  const mutated = script.replace(/\n[ \t]*set \+e\n/, '\n')
  expect(mutated, '"set +e" line not found in the smoke-test script — this mutation is vacuous').not.toBe(script)
  return mutated
}

// Stands in for `claude --print --permission-mode plan --model <m> --max-turns 1`
// (the exact invocation `invokeVerifierEngine` in review.ts uses, and this
// step mirrors). Reads and discards stdin (the piped prompt) exactly as the
// real CLI would, then behaves per MOCK_CLAUDE_RUN_MODE — no subcommand
// switching needed, unlike the retired opencode fake, since this step never
// passes claude a verb.
const FAKE_CLAUDE = `#!/usr/bin/env bash
cat >/dev/null
case "\${MOCK_CLAUDE_RUN_MODE:-fail}" in
  fail)
    echo "simulated: Unexpected server error from provider" >&2
    exit 1
    ;;
  bad-verdict)
    printf 'I looked at the diff.\\nVERDICT: MAYBE\\n'
    exit 0
    ;;
  pass)
    printf 'VERDICT: PASS\\n'
    exit 0
    ;;
  *)
    echo "unhandled fake claude invocation: $*" >&2
    exit 99
    ;;
esac
`

let scratch: string
let binDir: string
let runnerTemp: string
let originalPath: string | undefined

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'llamenos-fleet-review-smoke-'))
  binDir = join(scratch, 'bin')
  runnerTemp = join(scratch, 'runner-temp')
  mkdirSync(binDir)
  mkdirSync(runnerTemp)
  writeFileSync(join(binDir, 'claude'), FAKE_CLAUDE)
  chmodSync(join(binDir, 'claude'), 0o755)
  originalPath = process.env['PATH']
  process.env['PATH'] = `${binDir}${delimiter}${originalPath ?? ''}`
})

afterEach(() => {
  process.env['PATH'] = originalPath
  rmSync(scratch, { recursive: true, force: true })
})

/** Runs a script body the way GitHub runs an unshelled `run:` step:
 *  `bash -e <file>`. Captures stdout+stderr combined, the way a job log
 *  reads it. */
function runStep(script: string, runMode: 'fail' | 'bad-verdict' | 'pass'): { status: number | null; output: string } {
  const scriptPath = join(scratch, 'step.sh')
  writeFileSync(scriptPath, script)
  const result = spawnSync('bash', ['-e', scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env['PATH'] ?? ''}`,
      RUNNER_TEMP: runnerTemp,
      FLEET_REVIEW_MODEL: 'test-model',
      MOCK_CLAUDE_RUN_MODE: runMode,
    },
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

describe('rail: the review-engine smoke step must always say why it failed', () => {
  it('finds a non-trivial script to test at all — the parser must not pass vacuously', () => {
    expect(smokeStepScript().length).toBeGreaterThan(500)
  })

  it('claude failing (simulated provider outage) reaches fail() and reports engine-unavailable', () => {
    const { status, output } = runStep(smokeStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain('engine-unavailable')
    expect(output).toContain('simulated: Unexpected server error from provider')
  })

  it('claude succeeding but never producing a PASS verdict also reaches fail() (the verdict_out capture is guarded too)', () => {
    const { status, output } = runStep(smokeStepScript(), 'bad-verdict')
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain('engine-unavailable')
  })

  it('the happy path still reports OK and exits 0', () => {
    const { status, output } = runStep(smokeStepScript(), 'pass')
    expect(status).toBe(0)
    expect(output).toContain('review engine smoke test OK')
    expect(output).not.toContain(FAILED_MARKER)
  })

  // MUTATION GUARD (per "audit gates by breaking them"): reintroduce the
  // exact defect this PR fixes — drop the `set +e` line — and prove the
  // step goes back to failing SILENTLY. If this test ever fails to show the
  // marker missing, the "fixed" tests above have stopped being a real rail
  // (e.g. because something else started guarding the capture instead) and
  // this file needs to be re-examined, not just re-run.
  it('MUTATION: without "set +e", the same engine failure is swallowed — no marker, no classification', () => {
    const { status, output } = runStep(withoutTheFix(smokeStepScript()), 'fail')
    expect(status).toBe(1) // still fails — that part was never in question
    expect(output).not.toContain(FAILED_MARKER)
    expect(output).not.toContain('engine-unavailable')
    expect(output).not.toContain('simulated: Unexpected server error from provider')
  })
})
