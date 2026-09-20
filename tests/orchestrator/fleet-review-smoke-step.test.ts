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
    /combined="\$run_out"\$'\\n'"\$run_err"[\s\S]*?fail "\$\(classify "\$combined"\)" "\$combined\$attempt_note"\n/,
    () => 'fail "$(classify "$run_out"$\'\\n\'"$run_err")" "$run_out"$\'\\n\'"$run_err"\n',
  )
  expect(mutated, 'registry pre-check block not found in the smoke-test script — this mutation is vacuous').not.toBe(script)
  return mutated
}

/** Simulates "the retry swallows a persistent failure" — the mutation rule
 *  2 (in the PR that added the cold-start retry) exists to catch. Forces
 *  `run_status=0` the moment attempts are exhausted, so the unconditional
 *  `fail()` after the loop never runs and a still-failing engine call is
 *  treated as if it had succeeded. Asserts the loop-exhaustion branch was
 *  actually present, so this can never pass vacuously. */
function withSwallowedPersistentFailure(script: string): string {
  const target = 'if [ "$smoke_run_attempt" -ge "$smoke_run_max_attempts" ]; then\n    break\n  fi'
  const replacement = 'if [ "$smoke_run_attempt" -ge "$smoke_run_max_attempts" ]; then\n    run_status=0\n    break\n  fi'
  const mutated = script.replace(target, replacement)
  expect(mutated, 'retry-exhaustion branch not found in the smoke-test script — this mutation is vacuous').not.toBe(script)
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
      transient)
        # Simulates cold-start registry flakiness: fails on every invocation
        # until MOCK_OPENCODE_FAIL_UNTIL_ATTEMPT (exclusive), then succeeds —
        # tracked in MOCK_OPENCODE_COUNT_FILE because each retry is a
        # separate process, so in-memory state can't carry across attempts.
        count_file="\${MOCK_OPENCODE_COUNT_FILE:?MOCK_OPENCODE_COUNT_FILE required for transient mode}"
        n=0
        [ -f "\$count_file" ] && n="\$(cat "\$count_file")"
        n=\$((n + 1))
        echo "\$n" > "\$count_file"
        if [ "\$n" -lt "\${MOCK_OPENCODE_FAIL_UNTIL_ATTEMPT:-2}" ]; then
          echo "simulated: Unexpected server error from provider (cold-start attempt \$n)" >&2
          exit 1
        fi
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
 *  reads it. `extraEnv` carries the `transient` mode's own knobs
 *  (`MOCK_OPENCODE_COUNT_FILE`, `MOCK_OPENCODE_FAIL_UNTIL_ATTEMPT`) without
 *  widening this signature for every other mode that doesn't need them. */
function runStep(
  script: string,
  runMode: 'fail' | 'bad-verdict' | 'pass' | 'transient',
  extraEnv: Record<string, string> = {},
): { status: number | null; output: string } {
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
      ...extraEnv,
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

/**
 * Rail for the cold-start retry wrapped around the `opencode run` call
 * itself (see the PR that added this describe block and the `transient`
 * fake-opencode mode above). Before this, ANY failed call — a genuine
 * outage or a one-off cold-cache resolution flake — failed the smoke step
 * on the very first try, which is what made `fleet/review` fail here
 * roughly 10 times in 24 while the operator's own warm-cache runs passed
 * 3/3 back to back. Root cause, confirmed locally against the real,
 * CI-pinned opencode binary extracted into a clean prefix with an empty
 * `$XDG_CACHE_HOME` (see the PR body for the transcript): the first
 * `opencode run` on a cold box fetches and writes
 * `$XDG_CACHE_HOME/opencode/models.json` — byte-identical in size to a
 * direct `curl https://models.dev/api.json` — before it can resolve
 * anything, stacking a second network dependency in front of the provider
 * call on a runner with no warm state.
 *
 * The fix retries the ENGINE CALL a small, bounded number of times
 * (`smoke_run_max_attempts`, currently 3) with a short flat backoff
 * (`smoke_run_backoff_seconds`, currently 2s) — never the "Review" step,
 * which must reach a real, once-only verdict (see the next describe block).
 */
describe('rail: the smoke probe retries a transient cold-start failure, but a persistent one still fails loudly', () => {
  it('a transient failure followed by a success is a PASSING step, and the log records that a retry happened', () => {
    const countFile = join(scratch, 'attempt-count')
    const { status, output } = runStep(smokeStepScript(), 'transient', {
      MOCK_OPENCODE_COUNT_FILE: countFile,
      MOCK_OPENCODE_FAIL_UNTIL_ATTEMPT: '2', // fails attempt 1, succeeds attempt 2
    })
    expect(status).toBe(0)
    expect(output).not.toContain(FAILED_MARKER)
    expect(output).toContain('review engine smoke test OK')
    // The retry actually happened — not silently absorbed into a plain pass.
    expect(output).toMatch(/engine call attempt 1\/3 failed/)
    expect(output).toMatch(/recovered after a transient failure — succeeded on attempt 2\/3/)
  })

  it("a persistent failure still FAILS after exhausting every attempt, with the classification, the attempt count, and the engine's own error text all intact", () => {
    const countFile = join(scratch, 'attempt-count')
    const { status, output } = runStep(smokeStepScript(), 'transient', {
      MOCK_OPENCODE_COUNT_FILE: countFile,
      MOCK_OPENCODE_FAIL_UNTIL_ATTEMPT: '99', // never succeeds within 3 attempts
    })
    expect(status).toBe(1)
    expect(output).toContain(FAILED_MARKER)
    expect(output).toContain('engine-unavailable')
    expect(output).toContain('failed after 3/3 attempts')
    expect(output).toContain('simulated: Unexpected server error from provider (cold-start attempt 3)')
  })

  it('the pre-existing "always fails" fixture also exhausts all 3 attempts before failing, proving the retry engages on it too', () => {
    const { status, output } = runStep(smokeStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toMatch(/engine call attempt 1\/3 failed/)
    expect(output).toMatch(/engine call attempt 2\/3 failed/)
    expect(output).toContain('failed after 3/3 attempts')
  })

  // MUTATION GUARD (per "audit gates by breaking them"): make the
  // loop-exhaustion branch swallow a persistent failure — treat "ran out of
  // attempts" as success instead of falling through to the unconditional
  // fail() — and prove the assertions above stop holding. If this test ever
  // fails to show the markers missing, the "persistent failure still fails"
  // test above has stopped being a real rail and needs re-examination, not
  // just a re-run.
  it('MUTATION: forcing run_status=0 on attempt exhaustion swallows the persistent failure — classification and attempt-count text disappear', () => {
    const countFile = join(scratch, 'attempt-count')
    const mutated = withSwallowedPersistentFailure(smokeStepScript())
    const { output } = runStep(mutated, 'transient', {
      MOCK_OPENCODE_COUNT_FILE: countFile,
      MOCK_OPENCODE_FAIL_UNTIL_ATTEMPT: '99',
    })
    // Still not a silent PASS — with run_status forced to 0, the mutated
    // script falls through to verdict parsing on an empty run_out (the
    // fixture only ever wrote its error to stderr) and fails THERE instead,
    // an unrelated `engine-unavailable` for an UNREADABLE verdict. That is
    // exactly what "swallowing" looks like: the step still goes red, but
    // the specific diagnostic this rail cares about — which attempt count,
    // and the engine's OWN error text from the actual failure — is gone,
    // replaced by a generic verdict-parse failure that explains nothing
    // about the real cause. Both assertions below are what the un-mutated
    // "persistent failure" test above asserts DOES survive; proving they
    // vanish here is what makes that test's coverage real.
    expect(output).not.toContain('failed after 3/3 attempts')
    expect(output).not.toContain('simulated: Unexpected server error from provider (cold-start attempt 3)')
  })
})

/**
 * Rail for the boundary the cold-start retry must never cross: the PROBE
 * may retry, the VERDICT never may. A "second opinion" obtained by re-asking
 * the reviewer until the answer looks right is not a second opinion — see
 * the smoke-test step's own comment on this. This reads the "Review" step's
 * `run:` block directly out of the real workflow file, the same
 * YAML-parsing approach `smokeStepScript()` above uses, so it can never
 * drift from a hand-copied snippet of the actual step.
 */
describe('rail: the "Review" step itself is never retried', () => {
  const REVIEW_STEP_NAME = 'Review'
  const REVIEW_RUN_LINE = '        run: bun orchestrator/src/cli.ts review-ci\n'

  function reviewStepScriptFrom(doc: WorkflowDoc): string {
    const job = doc.jobs['fleet-review']
    if (!job) throw new Error('no "fleet-review" job found in fleet-review.yml — the parser must not pass vacuously')
    const step = job.steps.find((s) => s.name === REVIEW_STEP_NAME)
    if (!step || typeof step.run !== 'string') {
      throw new Error(`no "${REVIEW_STEP_NAME}" step with a run: block found — the parser must not pass vacuously`)
    }
    return step.run
  }

  function reviewStepScript(): string {
    return reviewStepScriptFrom(parseYaml(readFileSync(FLEET_REVIEW_YML, 'utf8')) as WorkflowDoc)
  }

  /** Mutates the RAW file text — not a hand-built string that merely
   *  resembles it — replacing the Review step's single-line invocation with
   *  a retry loop wrapped around the identical command, then re-parses
   *  through the same YAML path the guard itself uses. Proves the guard
   *  reacts to the actual file shape. */
  function withReviewStepRetried(): WorkflowDoc {
    const raw = readFileSync(FLEET_REVIEW_YML, 'utf8')
    expect(raw, 'Review step run: line not found in the expected exact shape — this mutation is vacuous').toContain(REVIEW_RUN_LINE)
    const replacement = [
      '        run: |',
      '          for review_attempt in 1 2 3; do',
      '            bun orchestrator/src/cli.ts review-ci && break',
      '            sleep 5',
      '          done',
      '',
    ].join('\n')
    const mutatedRaw = raw.replace(REVIEW_RUN_LINE, replacement)
    expect(mutatedRaw).not.toBe(raw)
    return parseYaml(mutatedRaw) as WorkflowDoc
  }

  it('is exactly the single review-ci invocation — no loop, no retry, no backoff wrapped around it', () => {
    const script = reviewStepScript()
    expect(script.trim()).toBe('bun orchestrator/src/cli.ts review-ci')
    expect(script).not.toMatch(/\b(while|until|for)\b/)
    expect(script.toLowerCase()).not.toMatch(/retry|attempt|backoff/)
  })

  // MUTATION GUARD: prove the assertions above are a real rail — wrap the
  // IDENTICAL invocation in a retry loop (the same shape the smoke probe's
  // own fix uses) and confirm the guard rejects it.
  it('MUTATION: wrapping the Review step in a retry loop is caught by the no-retry assertions above', () => {
    const mutatedScript = reviewStepScriptFrom(withReviewStepRetried())
    expect(mutatedScript.trim()).not.toBe('bun orchestrator/src/cli.ts review-ci')
    expect(mutatedScript).toMatch(/\b(while|until|for)\b/)
    expect(mutatedScript.toLowerCase()).toMatch(/attempt/)
  })
})
