import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for the "Sign release artifacts (keyless)" step in release.yml.
 *
 * Root cause (run 35484170448, job `release`): cosign v3 flips
 * `--new-bundle-format` and `--use-signing-config` to default `true`. Under
 * that default, `--output-signature`/`--output-certificate` are silently
 * deprecated-and-ignored, and cosign instead tries to write a Sigstore
 * bundle to whatever `--bundle` says — which this step never set. cosign
 * tries to create a bundle file at an EMPTY path and dies:
 * "Error: signing CHECKSUMS.txt: create bundle file: open : no such file or
 * directory". No release has ever been produced by this workflow; this was
 * the sole blocker. The fix pins the cosign version explicitly and passes
 * `--new-bundle-format=false --use-signing-config=false` so the step keeps
 * producing the separate `.cosign.sig`/`.cosign.pem` files that
 * `scripts/verify-build.sh` (owned elsewhere, not touched by this PR)
 * already knows how to verify.
 *
 * This is a real functional test, not a text/regex rail over the YAML: it
 * extracts the step's ACTUAL `run:` script with a YAML parser (so it always
 * tests the literal bytes GitHub would run), executes it with `bash -e
 * <script>` — the same invocation GitHub uses for an unshelled step —
 * against a fake `cosign` binary that reproduces cosign v3's real observed
 * behavior, and asserts on the real stdout/stderr/exit code and on the
 * signature files actually landing on disk.
 *
 * Per "audit gates by breaking them": the rail this file exists to prove is
 * "a signing failure must fail the job, never publish an unsigned
 * release" — so alongside the happy path and the original-bug repro, there
 * is a MUTATION test that reintroduces error-tolerance (`|| true`) into the
 * fixed script and shows the assertions above would have caught it.
 */

const RELEASE_YML = join(process.cwd(), '.github', 'workflows', 'release.yml')
const STEP_NAME = 'Sign release artifacts (keyless)'
const REAL_BUG_ERROR = 'create bundle file: open : no such file or directory'

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
 *  the real YAML, never a hand-copied string that could silently drift
 *  from the file this rail is supposed to guard. */
function signingStepScript(): string {
  const doc = parseYaml(readFileSync(RELEASE_YML, 'utf8')) as WorkflowDoc
  const job = doc.jobs['release']
  if (!job) throw new Error('no "release" job found in release.yml — the parser must not pass vacuously')
  const step = job.steps.find((s) => s.name === STEP_NAME)
  if (!step || typeof step.run !== 'string') {
    throw new Error(`no "${STEP_NAME}" step with a run: block found — the parser must not pass vacuously`)
  }
  return step.run
}

/** The pre-fix shape: strips the two flags this PR adds, reproducing the
 *  exact defect that broke run 35484170448 (cosign v3's bundle-format
 *  default never disabled). Asserts both lines were actually present, so
 *  this can never pass vacuously against a script that already lost them
 *  for some unrelated reason. */
function withoutTheFix(script: string): string {
  const lines = script.split('\n')
  const keep = lines.filter((l) => {
    const t = l.trim()
    return t !== '--new-bundle-format=false \\' && t !== '--use-signing-config=false \\'
  })
  expect(lines.length - keep.length, 'expected to strip exactly 2 lines (--new-bundle-format=false, --use-signing-config=false)').toBe(2)
  return keep.join('\n')
}

/** Mutates the FIXED script to tolerate a cosign failure — the exact class
 *  of regression this rail exists to catch (per "audit gates by breaking
 *  them"). Appends `|| true` to the line that closes the multi-line
 *  `cosign sign-blob ... "$f"` invocation, so a non-zero cosign exit no
 *  longer aborts the step under GitHub's default `bash -e`. */
function withToleratedFailure(script: string): string {
  const lines = script.split('\n')
  const idx = lines.findIndex((l) => l.trim() === '"$f"')
  if (idx === -1) throw new Error('could not find the closing `"$f"` line of the cosign invocation — mutation is vacuous')
  lines[idx] = `${lines[idx]} || true`
  return lines.join('\n')
}

const FAKE_COSIGN = `#!/usr/bin/env bash
set -u
if [ "\${1:-}" != "sign-blob" ]; then
  echo "unhandled fake cosign invocation: $*" >&2
  exit 99
fi
shift

legacy_bundle_format=0
legacy_signing_config=0
sig_path=""
cert_path=""
blob=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --new-bundle-format=false)
      legacy_bundle_format=1
      shift
      ;;
    --use-signing-config=false)
      legacy_signing_config=1
      shift
      ;;
    --output-signature)
      sig_path="$2"
      shift 2
      ;;
    --output-certificate)
      cert_path="$2"
      shift 2
      ;;
    --yes)
      shift
      ;;
    -*)
      shift
      ;;
    *)
      blob="$1"
      shift
      ;;
  esac
done

# Reproduce cosign v3's REAL observed behavior: without both legacy flags,
# --output-signature/--output-certificate are ignored and it dies trying to
# write a bundle to an empty path — this is the exact bug from run
# 35484170448, not a stand-in for it.
if [ "$legacy_bundle_format" -ne 1 ] || [ "$legacy_signing_config" -ne 1 ]; then
  echo "Flag --output-signature has been deprecated, please use --bundle to provide the output bundle location, which will include the signature"
  echo "Flag --output-certificate has been deprecated, please use --bundle to provide the output bundle location, which will include the certificate"
  echo "WARNING: --output-signature is deprecated when using --new-bundle-format and will be ignored"
  echo "WARNING: --output-certificate is deprecated when using --new-bundle-format and will be ignored"
  echo "Generating ephemeral keys..."
  echo "Using payload from: $blob"
  echo "Signing artifact..."
  echo "Error: signing $blob: ${REAL_BUG_ERROR}" >&2
  echo "error during command execution: signing $blob: ${REAL_BUG_ERROR}" >&2
  exit 1
fi

case "\${MOCK_COSIGN_MODE:-succeed}" in
  succeed)
    echo "Generating ephemeral keys..."
    echo "Using payload from: $blob"
    echo "Signing artifact..."
    echo "fake-signature-for-$blob" > "$sig_path"
    echo "fake-certificate-for-$blob" > "$cert_path"
    exit 0
    ;;
  fail)
    echo "Generating ephemeral keys..."
    echo "simulated: Fulcio identity provider unavailable" >&2
    exit 1
    ;;
  *)
    echo "unhandled MOCK_COSIGN_MODE: \${MOCK_COSIGN_MODE:-}" >&2
    exit 98
    ;;
esac
`

let scratch: string
let binDir: string
let originalPath: string | undefined

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'llamenos-release-signing-'))
  binDir = join(scratch, 'bin')
  mkdirSync(binDir)
  writeFileSync(join(binDir, 'cosign'), FAKE_COSIGN)
  chmodSync(join(binDir, 'cosign'), 0o755)
  originalPath = process.env['PATH']
  // Only CHECKSUMS.txt exists — provenance.json is legitimately absent in
  // some runs, and the step's own `[ -f "$f" ] || continue` must skip it.
  writeFileSync(join(scratch, 'CHECKSUMS.txt'), 'deadbeef  some-artifact\n')
})

afterEach(() => {
  process.env['PATH'] = originalPath
  rmSync(scratch, { recursive: true, force: true })
})

/** Runs a script body the way GitHub runs an unshelled `run:` step:
 *  `bash -e <file>`, with cwd = the scratch checkout the real job would
 *  have. Captures stdout+stderr combined, the way a job log reads it. */
function runStep(script: string, mode: 'succeed' | 'fail'): { status: number | null; output: string } {
  const scriptPath = join(scratch, 'step.sh')
  writeFileSync(scriptPath, script)
  const result = spawnSync('bash', ['-e', scriptPath], {
    cwd: scratch,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env['PATH'] ?? ''}`,
      MOCK_COSIGN_MODE: mode,
    },
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
}

describe('rail: release signing must never publish without producing real signature material', () => {
  it('finds a non-trivial script to test at all — the parser must not pass vacuously', () => {
    expect(signingStepScript().length).toBeGreaterThan(200)
  })

  it('the fixed script disables the v3 bundle defaults cosign needs disabled', () => {
    const script = signingStepScript()
    expect(script).toContain('--new-bundle-format=false')
    expect(script).toContain('--use-signing-config=false')
    expect(script).toContain('--output-signature')
    expect(script).toContain('--output-certificate')
  })

  it('REGRESSION CHECK: the pre-fix script (flags stripped) reproduces the exact run-35484170448 failure', () => {
    const { status, output } = runStep(withoutTheFix(signingStepScript()), 'succeed')
    expect(status).toBe(1)
    expect(output).toContain(REAL_BUG_ERROR)
    expect(output).not.toContain('Signed: CHECKSUMS.txt')
  })

  it('happy path: the fixed script signs successfully and leaves real signature + certificate files on disk', () => {
    const { status, output } = runStep(signingStepScript(), 'succeed')
    expect(status).toBe(0)
    expect(output).toContain('Signed: CHECKSUMS.txt')
    expect(output).not.toContain(REAL_BUG_ERROR)
    expect(readFileSync(join(scratch, 'CHECKSUMS.txt.cosign.sig'), 'utf8')).toContain('fake-signature-for-CHECKSUMS.txt')
    expect(readFileSync(join(scratch, 'CHECKSUMS.txt.cosign.pem'), 'utf8')).toContain('fake-certificate-for-CHECKSUMS.txt')
  })

  it('a cosign signing failure (unrelated to the bundle bug, e.g. Fulcio outage) fails the step loudly — never swallowed', () => {
    const { status, output } = runStep(signingStepScript(), 'fail')
    expect(status).toBe(1)
    expect(output).toContain('simulated: Fulcio identity provider unavailable')
    expect(output).not.toContain('Signed: CHECKSUMS.txt')
  })

  // MUTATION GUARD (per "audit gates by breaking them"): take the FIXED
  // script and make it tolerate a cosign failure (`|| true`), then prove
  // the same failing cosign now produces a step that reports success and
  // an unsigned "Signed: CHECKSUMS.txt" claim. If this ever stops
  // differing from the previous test, the "fails loudly" assertions above
  // have stopped being a real rail and this file needs re-examining, not
  // just re-running.
  it('MUTATION: with error-tolerance added, the same cosign failure is swallowed and the step falsely reports success', () => {
    const { status, output } = runStep(withToleratedFailure(signingStepScript()), 'fail')
    expect(status).toBe(0)
    expect(output).toContain('Signed: CHECKSUMS.txt')
  })
})
