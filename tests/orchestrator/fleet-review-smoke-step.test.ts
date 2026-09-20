import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for the "Smoke-test the review engine" step in fleet-review.yml
 * silently swallowing an engine failure (see the PR that added this file).
 *
 * Root cause: GitHub runs a `run:` step with no `shell:` override as
 * `bash -e {0}` — `-e` is active from the moment the script starts. The
 * step's own `set -uo pipefail` does NOT clear an inherited `-e`; it only
 * adds `-u`/`pipefail` on top. Two captures in the step —
 * `run_out="$(... opencode run ...)"` and `verdict_out="$(... bun -e ...)"`
 * — were UNGUARDED (no `||` after the assignment), so the first one that
 * failed was itself a failing simple command under `-e`: the script died on
 * that line, before `run_status=$?`/`verdict_status=$?` were ever read,
 * before `classify()` ran, before `fail()` ever printed anything. The step
 * exited 1 with no diagnostic — exactly the opacity two supervision cycles
 * were spent grepping raw workflow logs to work around. The fix adds
 * `set +e` right after `set -uo pipefail`, which clears the inherited `-e`
 * so both captures reach their own status check and, on failure, `fail()`.
 *
 * This is a real functional test, not a text/regex rail over the YAML: it
 * extracts the step's ACTUAL `run:` script with a YAML parser (so it always
 * tests the literal bytes GitHub would run, and can never drift from a
 * hand-copied snippet), executes it with `bash -e <script>` — the same
 * invocation GitHub uses for an unshelled step — against a fake `opencode`
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

/** The pre-2026-09-19-fix shape: strips the registry pre-check this PR adds
 *  (`combined=...` through `fail "$(classify "$combined")" "$combined"`)
 *  back down to the single unconditional `classify()` call it replaced —
 *  reproducing exactly the defect where a dead provider/model id and a real
 *  outage were indistinguishable. Asserts the block was actually present,
 *  so this can never pass vacuously against a script that already dropped
 *  it for some other reason. */
function withoutMisconfiguredCheck(script: string): string {
  // A function replacer, deliberately — not a string one. The replacement
  // text below legitimately contains the literal two-character sequence
  // `$'` (bash's ANSI-C-quoted-string syntax, `$'\n'`), which
  // `String.prototype.replace` treats as ITS OWN special substitution
  // pattern ("insert everything after the match") when the replacement is a
  // plain string — silently splicing the rest of the script into the middle
  // of this line instead of the intended one-liner. A function return value
  // is inserted verbatim, with no macro-substitution at all.
  const mutated = script.replace(
    /combined="\$run_out"\$'\\n'"\$run_err"[\s\S]*?fail "\$\(classify "\$combined"\)" "\$combined"\n/,
    () => 'fail "$(classify "$run_out"$\'\\n\'"$run_err")" "$run_out"$\'\\n\'"$run_err"\n',
  )
  expect(mutated, 'registry pre-check block not found in the smoke-test script — this mutation is vacuous').not.toBe(script)
  return mutated
}

const FAKE_OPENCODE = `#!/usr/bin/env bash
case "$1" in
  debug)
    cat <<'JSON'
{"permission":{"bash":"deny","edit":"deny","webfetch":"deny","websearch":"deny","external_directory":{"*":"deny"}}}
JSON
    exit 0
    ;;
  run)
    cat >/dev/null
    case "\${MOCK_OPENCODE_RUN_MODE:-fail}" in
      fail)
        echo "simulated: Unexpected server error from provider" >&2
        exit 1
        ;;
      bad-verdict)
        echo '{"type":"text","part":{"type":"text","text":"I looked at the diff.\\nVERDICT: MAYBE"}}'
        exit 0
        ;;
      pass)
        echo '{"type":"text","part":{"type":"text","text":"VERDICT: PASS"}}'
        exit 0
        ;;
    esac
    ;;
  --version)
    echo "mock-opencode 0.0.0"
    exit 0
    ;;
  *)
    echo "unhandled fake opencode invocation: $*" >&2
    exit 99
    ;;
esac
`

let scratch: string
let binDir: string
let runnerTemp: string
let cacheHome: string
let originalPath: string | undefined

// `FLEET_REVIEW_MODEL` needs a `provider/model` shape (a bare id like the
// old `'test-model'` has no slash, so `checkOpencodeModelKnown` — reused
// from review.ts, see below — can never resolve it to anything but
// 'indeterminate', which would make the engine-misconfigured tests vacuous).
const TEST_PROVIDER = 'test-provider'
const TEST_MODEL_ID = 'test-model'
const FLEET_REVIEW_MODEL = `${TEST_PROVIDER}/${TEST_MODEL_ID}`

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'llamenos-fleet-review-smoke-'))
  binDir = join(scratch, 'bin')
  runnerTemp = join(scratch, 'runner-temp')
  cacheHome = join(scratch, 'cache')
  mkdirSync(binDir)
  mkdirSync(runnerTemp)
  mkdirSync(cacheHome)
  writeFileSync(join(binDir, 'opencode'), FAKE_OPENCODE)
  chmodSync(join(binDir, 'opencode'), 0o755)
  originalPath = process.env['PATH']
  process.env['PATH'] = `${binDir}${delimiter}${originalPath ?? ''}`
})

afterEach(() => {
  process.env['PATH'] = originalPath
  rmSync(scratch, { recursive: true, force: true })
})

/** Writes a fixture standing in for opencode's own local models.dev cache
 *  (`$XDG_CACHE_HOME/opencode/models.json`) — never the real one, so these
 *  tests never depend on what happens to be cached on whatever box runs
 *  them. Deliberately NOT called by default: an absent cache is
 *  'indeterminate' (see checkOpencodeModelKnown in review.ts), which is what
 *  keeps the pre-existing fail/bad-verdict/pass tests below exercising the
 *  ordinary classify() heuristic, unaffected by this rail's addition. */
function writeModelRegistry(registry: Record<string, unknown>): void {
  const dir = join(cacheHome, 'opencode')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'models.json'), JSON.stringify(registry))
}

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
      XDG_CACHE_HOME: cacheHome,
      FLEET_REVIEW_PROVIDER: TEST_PROVIDER,
      FLEET_REVIEW_MODEL,
      MOCK_OPENCODE_RUN_MODE: runMode,
    },
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

describe('rail: the review-engine smoke step must always say why it failed', () => {
  it('finds a non-trivial script to test at all — the parser must not pass vacuously', () => {
    expect(smokeStepScript().length).toBeGreaterThan(500)
  })

  it('opencode run failing (simulated provider outage) reaches fail() and reports engine-unavailable', () => {
    const { status, output } = runStep(smokeStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain('engine-unavailable')
    expect(output).toContain('simulated: Unexpected server error from provider')
  })

  it('opencode run succeeding but never producing a PASS verdict also reaches fail() (the verdict_out capture is guarded too)', () => {
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

/**
 * Rail for the registry pre-check added alongside the config-gate step
 * (fleet-review-config-gate.test.ts) and its counterpart in
 * `orchestrator/src/review.ts` (`invokeVerifierEngine`'s
 * `checkOpencodeModelKnown` call, see `tests/orchestrator/review.test.ts`).
 *
 * Before this, a dead provider/model id and a real transient outage failed
 * the smoke test IDENTICALLY — both fell through to `classify()`'s text
 * heuristic, which has no way to tell "the provider doesn't exist" from
 * "the provider is temporarily down", and both produced the same opaque
 * `engine-unavailable`. That ambiguity is the entire reason the
 * `kimi-for-coding` retirement cost a full night: an unresolvable id and a
 * quota outage looked the same in the log.
 *
 * The fix reuses `checkOpencodeModelKnown` from review.ts — the SAME
 * function the real review's pre-flight check uses — rather than
 * reimplementing the registry lookup a second time, so the smoke test and
 * the real review can never name this condition differently.
 */
describe('rail: the smoke step names an unresolvable provider/model id as engine-misconfigured, not engine-unavailable', () => {
  it('reports engine-misconfigured — not engine-unavailable — when the configured id is not in opencode\'s local model registry', () => {
    writeModelRegistry({ 'some-other-provider': { models: { 'k3-256k': {} } } })
    const { status, output } = runStep(smokeStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain('engine-misconfigured')
    expect(output).not.toContain('engine-unavailable')
  })

  it('still reports engine-unavailable — not engine-misconfigured — when the configured id IS known but the call itself fails', () => {
    writeModelRegistry({ [TEST_PROVIDER]: { models: { [TEST_MODEL_ID]: {} } } })
    const { status, output } = runStep(smokeStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain('engine-unavailable')
    expect(output).not.toContain('engine-misconfigured')
  })

  it('does not misreport engine-misconfigured on a cold/missing registry cache — falls through to the ordinary heuristic instead', () => {
    // Deliberately no writeModelRegistry() call: matches the default
    // fixtures used by the pre-existing fail/bad-verdict/pass tests above,
    // reproducing a box that has never run opencode before.
    const { status, output } = runStep(smokeStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toContain('engine-unavailable')
    expect(output).not.toContain('engine-misconfigured')
  })

  // MUTATION GUARD (per "audit gates by breaking them"): strip the registry
  // pre-check back out and prove the smoke step regresses to the exact
  // ambiguity this rail exists to remove — a dead id reported as the same
  // generic engine-unavailable a transient outage would produce.
  it('MUTATION: without the registry pre-check, an unresolvable id is misreported as engine-unavailable again', () => {
    writeModelRegistry({ 'some-other-provider': { models: { 'k3-256k': {} } } })
    const { status, output } = runStep(withoutMisconfiguredCheck(smokeStepScript()), 'fail')
    expect(status).toBe(1) // still fails — that part was never in question
    expect(output).toContain('engine-unavailable')
    expect(output).not.toContain('engine-misconfigured')
  })
})
