import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for the "Require review engine configuration" step in
 * fleet-review.yml.
 *
 * Until this fix, `FLEET_REVIEW_PROVIDER` / `FLEET_REVIEW_MODEL` defaulted
 * to a hardcoded, now-retired provider id (`kimi-for-coding` /
 * `kimi-for-coding/k3-256k`, via `${{ vars.X || 'literal' }}`) whenever the
 * repo variables were unset. That id was retired on 2026-09-19; every
 * request against it failed with an opaque `UnknownError: "Unexpected
 * server error"` that read exactly like a provider outage. The gate has
 * stayed green since only because the repo variables were set BY HAND to
 * the live id after that incident — invisible, load-bearing configuration
 * that a cleared variable would silently undo with no diff and no signal.
 *
 * The fix removes the `||` literal fallback from the job's `env:` block
 * (see the "no literal fallback" rail in guards.test.ts, which is what
 * actually catches ITS reintroduction — GitHub's `${{ }}` expression syntax
 * is evaluated before any step runs, so no runtime script here can observe
 * it) and adds this step, which turns "vars unset → silently guess" into
 * "vars unset → fail loud, naming exactly what's missing".
 *
 * This file proves that replacement mechanism actually works: it extracts
 * the real `run:` script with a YAML parser (so it can never drift from a
 * hand-copied snippet — same technique as fleet-review-smoke-step.test.ts)
 * and executes it with `bash -e`, the same invocation GitHub uses for an
 * unshelled step, against real env var combinations.
 */

const FLEET_REVIEW_YML = join(process.cwd(), '.github', 'workflows', 'fleet-review.yml')
const STEP_NAME = 'Require review engine configuration'

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
function configGateScript(): string {
  const doc = parseYaml(readFileSync(FLEET_REVIEW_YML, 'utf8')) as WorkflowDoc
  const job = doc.jobs['fleet-review']
  if (!job) throw new Error('no "fleet-review" job found in fleet-review.yml — the parser must not pass vacuously')
  const step = job.steps.find((s) => s.name === STEP_NAME)
  if (!step || typeof step.run !== 'string') {
    throw new Error(`no "${STEP_NAME}" step with a run: block found — the parser must not pass vacuously`)
  }
  return step.run
}

/** Runs the extracted script the way GitHub runs an unshelled `run:` step:
 *  `bash -e <file>`, with exactly the env vars the caller supplies (plus
 *  whatever the host process already has — never relied on here, since
 *  every test below sets both variables explicitly, including to `''` to
 *  simulate an unset repo variable, which is what `${{ vars.X }}` resolves
 *  to when `X` does not exist). */
function runStep(env: Record<string, string>): { status: number | null; output: string } {
  const scratch = mkdtempSync(join(tmpdir(), 'llamenos-fleet-review-config-gate-'))
  try {
    const scriptPath = join(scratch, 'step.sh')
    writeFileSync(scriptPath, configGateScript())
    const result = spawnSync('bash', ['-e', scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

describe('rail: the review engine requires explicit configuration — an unset variable fails loud, never silently', () => {
  it('finds a non-trivial script to test at all — the parser must not pass vacuously', () => {
    expect(configGateScript().length).toBeGreaterThan(200)
  })

  // The state a cleared (or never-set) repo variable actually produces:
  // `${{ vars.FLEET_REVIEW_PROVIDER }}` with no fallback resolves to an
  // empty string, not an error and not "unset" in any way bash can detect
  // except `-z`.
  it('fails, naming BOTH variables, when neither is configured', () => {
    const { status, output } = runStep({ FLEET_REVIEW_PROVIDER: '', FLEET_REVIEW_MODEL: '' })
    expect(status).toBe(1)
    expect(output).toContain('::error::')
    expect(output).toContain('FLEET_REVIEW_PROVIDER')
    expect(output).toContain('FLEET_REVIEW_MODEL')
  })

  it('fails, naming only the missing one, when only FLEET_REVIEW_MODEL is unset', () => {
    const { status, output } = runStep({ FLEET_REVIEW_PROVIDER: 'kimi-code-plan-global', FLEET_REVIEW_MODEL: '' })
    expect(status).toBe(1)
    expect(output).toContain('FLEET_REVIEW_MODEL')
    // The variable that IS configured must not also be reported as missing.
    expect(output).not.toMatch(/- FLEET_REVIEW_PROVIDER/)
  })

  it('fails, naming only the missing one, when only FLEET_REVIEW_PROVIDER is unset', () => {
    const { status, output } = runStep({ FLEET_REVIEW_PROVIDER: '', FLEET_REVIEW_MODEL: 'kimi-code-plan-global/k3-256k' })
    expect(status).toBe(1)
    expect(output).toContain('FLEET_REVIEW_PROVIDER')
    expect(output).not.toMatch(/- FLEET_REVIEW_MODEL/)
  })

  it('points at the documented source of truth for the live id, not a guessed value', () => {
    const { output } = runStep({ FLEET_REVIEW_PROVIDER: '', FLEET_REVIEW_MODEL: '' })
    expect(output).toContain('DEFAULT_OPENCODE_MODEL')
  })

  it('passes through silently when both are configured — the ordinary, already-working case', () => {
    const { status, output } = runStep({
      FLEET_REVIEW_PROVIDER: 'kimi-code-plan-global',
      FLEET_REVIEW_MODEL: 'kimi-code-plan-global/k3-256k',
    })
    expect(status).toBe(0)
    expect(output).toContain('review engine configuration present')
    expect(output).not.toContain('::error::')
  })
})
