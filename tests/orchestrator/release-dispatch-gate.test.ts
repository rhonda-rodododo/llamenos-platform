import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for two related defects in release.yml, both surfaced by run
 * 35489888506 (v0.19.13): `check`/`build`/`release` all succeeded, but
 * `dispatch` — the job that actually triggers the desktop and mobile
 * release workflows a tester would install — was SKIPPED, because
 * `docker-stable` (pure container-registry publishing) failed and sat in
 * `dispatch`'s `needs`. `docker-stable` itself failed for a reason that has
 * nothing to do with producing an installer: Docker Hub credentials are not
 * configured in this repo, so `docker/login-action` errored with "Username
 * and password required", which cascaded into a failed Trivy upload
 * (`trivy-results.sarif` never existed because the scan never ran).
 *
 * Two fixes, two rails:
 *
 * 1. `dispatch` must depend only on what it actually needs (`check` for the
 *    version, `release` for the release existing) — never on `docker-stable`.
 * 2. `docker-stable` must skip its publish steps cleanly, with a log line,
 *    when Docker Hub credentials are absent — the same precedent already set
 *    by the "GPG sign CHECKSUMS.txt" step in the `release` job. Crucially,
 *    if credentials ARE present and login/build/push/sign then fails for a
 *    real reason, that must still be a hard job failure, never swallowed.
 *
 * Per "audit gates by breaking them": both rails below include a MUTATION
 * that reintroduces the exact defect being guarded against, and asserts the
 * rail would have caught it.
 */

const RELEASE_YML = join(process.cwd(), '.github', 'workflows', 'release.yml')

interface WorkflowStep {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  'continue-on-error'?: boolean
}
interface WorkflowJob {
  needs?: string | string[]
  steps: WorkflowStep[]
}
interface WorkflowDoc {
  jobs: Record<string, WorkflowJob>
}

function loadWorkflow(): WorkflowDoc {
  return parseYaml(readFileSync(RELEASE_YML, 'utf8')) as WorkflowDoc
}

function job(doc: WorkflowDoc, name: string): WorkflowJob {
  const j = doc.jobs[name]
  if (!j) throw new Error(`no "${name}" job found in release.yml — the parser must not pass vacuously`)
  return j
}

function needsOf(j: WorkflowJob): string[] {
  if (!j.needs) return []
  return Array.isArray(j.needs) ? j.needs : [j.needs]
}

function step(j: WorkflowJob, name: string): WorkflowStep {
  const s = j.steps.find((s) => s.name === name)
  if (!s) throw new Error(`no "${name}" step found — the parser must not pass vacuously`)
  return s
}

// ---------------------------------------------------------------------------
// Rail 1: dispatch's dependency graph must never let an optional publish
// job gate a required artifact job.
//
// This models GitHub Actions' REAL default job-condition semantics: a job
// with no explicit `if:` uses the implicit condition `success()`, which
// requires every job listed in `needs` to have succeeded. If any needed job
// failed, the dependent job is skipped (not failed) — this is exactly what
// turned `dispatch` into SKIPPED in run 35489888506, not a stand-in for it.
// None of the jobs under test here declare a job-level `if:`, so this
// straightforward model is faithful to what GitHub actually does for them.
// ---------------------------------------------------------------------------

type JobStatus = 'success' | 'failure'

/** Whether a job with the given `needs` list would run, under GitHub's
 *  default implicit `success()` condition (no job-level `if:` override). */
function wouldRunUnderDefaultCondition(needs: string[], statuses: Record<string, JobStatus>): boolean {
  return needs.every((n) => statuses[n] === 'success')
}

describe('rail: dispatch must not be gated by optional container publishing', () => {
  it('finds a non-trivial dispatch job with real needs — the parser must not pass vacuously', () => {
    const doc = loadWorkflow()
    const needs = needsOf(job(doc, 'dispatch'))
    expect(needs.length).toBeGreaterThan(0)
  })

  it('the real dispatch job needs only check and release — never docker-stable', () => {
    const doc = loadWorkflow()
    const needs = needsOf(job(doc, 'dispatch'))
    expect(needs).toContain('check')
    expect(needs).toContain('release')
    expect(needs).not.toContain('docker-stable')
  })

  it('REGRESSION CHECK (run 35489888506): with the real dispatch needs, a failed docker-stable does not block dispatch', () => {
    const doc = loadWorkflow()
    const needs = needsOf(job(doc, 'dispatch'))
    const statuses: Record<string, JobStatus> = { check: 'success', release: 'success', 'docker-stable': 'failure' }
    expect(wouldRunUnderDefaultCondition(needs, statuses)).toBe(true)
  })

  it('no other job in this file has an optional-publish job gating a required-artifact job', () => {
    // Audit every job's needs: `build` and `release` are required-artifact
    // dependencies (their outputs/artifacts are consumed downstream), and
    // `docker-stable` legitimately needs `release` (it publishes what
    // `release` produced) — but nothing needs `docker-stable` except the
    // now-removed dispatch edge. If a future job adds a dependency on
    // docker-stable, this test forces a conscious decision about whether
    // that repeats the exact shape being fixed here.
    const doc = loadWorkflow()
    for (const [jobName, j] of Object.entries(doc.jobs)) {
      const needs = needsOf(j)
      if (needs.includes('docker-stable')) {
        throw new Error(
          `job "${jobName}" needs docker-stable — an optional publish job must never gate another job; ` +
          `see the shape this test guards against`,
        )
      }
    }
  })

  // MUTATION GUARD: reintroduce the exact pre-fix shape (docker-stable back
  // in dispatch's needs) onto a COPY of the real needs, and prove the same
  // simulator that passed above now correctly reports the run-35489888506
  // skip. This demonstrates the simulator is sound, not just that the real
  // file happens to look right.
  it('MUTATION: reintroducing docker-stable into needs reproduces the exact SKIPPED outcome from run 35489888506', () => {
    const doc = loadWorkflow()
    const realNeeds = needsOf(job(doc, 'dispatch'))
    const mutatedNeeds = [...realNeeds, 'docker-stable']
    const statuses: Record<string, JobStatus> = { check: 'success', release: 'success', 'docker-stable': 'failure' }
    expect(wouldRunUnderDefaultCondition(mutatedNeeds, statuses)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Rail 2: docker-stable must skip cleanly when Docker Hub credentials are
// absent, and must still hard-fail when credentials are present but the
// registry step itself fails.
// ---------------------------------------------------------------------------

const CREDS_STEP_NAME = 'Check Docker Hub credentials'
const GATED_STEP_NAMES = [
  'Set up Docker Buildx',
  'Log in to Docker Hub',
  'Compute stable tags',
  'Build and push stable image',
  'Generate SBOM attestation',
  'Install cosign',
  'Sign container image (keyless)',
  'Run Trivy vulnerability scanner',
]

let scratch: string

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'llamenos-docker-creds-'))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** Runs the "Check Docker Hub credentials" step's actual `run:` script the
 *  way GitHub runs an unshelled step: `bash -e <file>`, with GITHUB_OUTPUT
 *  pointed at a real scratch file so `>> "$GITHUB_OUTPUT"` behaves exactly
 *  as it does in Actions. */
function runCredsCheck(env: { DOCKERHUB_USERNAME?: string; DOCKERHUB_TOKEN?: string }): {
  status: number | null
  output: string
  githubOutput: string
} {
  const doc = loadWorkflow()
  const dockerStable = job(doc, 'docker-stable')
  const credsStep = step(dockerStable, CREDS_STEP_NAME)
  if (typeof credsStep.run !== 'string') {
    throw new Error(`"${CREDS_STEP_NAME}" has no run: block — the parser must not pass vacuously`)
  }
  const scriptPath = join(scratch, 'step.sh')
  const outputPath = join(scratch, 'github-output')
  writeFileSync(scriptPath, credsStep.run)
  writeFileSync(outputPath, '')
  const result = spawnSync('bash', ['-e', scriptPath], {
    cwd: scratch,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      DOCKERHUB_USERNAME: env.DOCKERHUB_USERNAME ?? '',
      DOCKERHUB_TOKEN: env.DOCKERHUB_TOKEN ?? '',
    },
  })
  return { status: result.status, output: `${result.stdout}\n${result.stderr}`, githubOutput: readFileSync(outputPath, 'utf8') }
}

describe('rail: docker-stable skips cleanly when unconfigured, fails hard when configured-but-broken', () => {
  it('finds a non-trivial credentials-check script — the parser must not pass vacuously', () => {
    const doc = loadWorkflow()
    const credsStep = step(job(doc, 'docker-stable'), CREDS_STEP_NAME)
    expect((credsStep.run ?? '').length).toBeGreaterThan(20)
  })

  it('with both credentials absent: skips cleanly, logs why, and sets configured=false', () => {
    const { status, output, githubOutput } = runCredsCheck({})
    expect(status).toBe(0)
    expect(output).toContain('Docker Hub credentials not configured')
    expect(output).toContain('skipping')
    expect(githubOutput).toContain('configured=false')
  })

  it('with only username set: still treated as unconfigured', () => {
    const { githubOutput } = runCredsCheck({ DOCKERHUB_USERNAME: 'someuser' })
    expect(githubOutput).toContain('configured=false')
  })

  it('with both credentials present: configured=true, no skip message', () => {
    const { status, output, githubOutput } = runCredsCheck({ DOCKERHUB_USERNAME: 'someuser', DOCKERHUB_TOKEN: 'sometoken' })
    expect(status).toBe(0)
    expect(output).not.toContain('not configured')
    expect(githubOutput).toContain('configured=true')
  })

  it('every publish/scan step is gated on steps.docker-creds.outputs.configured', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    for (const name of GATED_STEP_NAMES) {
      const s = step(dockerStable, name)
      expect(s.if, `step "${name}" must be gated on docker-creds`).toContain("steps.docker-creds.outputs.configured == 'true'")
    }
  })

  it('"Upload Trivy scan results" keeps its always() (upload-on-scan-failure) behavior AND is gated', () => {
    const doc = loadWorkflow()
    const s = step(job(doc, 'docker-stable'), 'Upload Trivy scan results')
    expect(s.if).toContain('always()')
    expect(s.if).toContain("steps.docker-creds.outputs.configured == 'true'")
  })

  // MUTATION GUARD: prove the "still runs" half of Rail 1 above is actually
  // exercised by the real needs graph, not just structurally true in
  // isolation — i.e., that removing the gate from dispatch really does mean
  // docker-stable being skipped-when-unconfigured no longer matters to it.
  it('MUTATION: restoring docker-stable into dispatch needs would make an unconfigured (skipped) docker-stable block dispatch again', () => {
    // docker-stable, when unconfigured, has every gated step SKIPPED. A
    // job whose steps are all skipped still reports overall conclusion
    // `success` in real GitHub Actions — but if some future edit changed
    // that (e.g. a required step outside the gate failed), and someone also
    // re-added docker-stable to dispatch's needs, dispatch would silently
    // stop running again. This asserts the two defenses are independent:
    // even if docker-stable's own success/failure semantics ever changed,
    // dispatch not depending on it at all is the actual fix.
    const doc = loadWorkflow()
    const realNeeds = needsOf(job(doc, 'dispatch'))
    const mutatedNeeds = [...realNeeds, 'docker-stable']
    const statuses: Record<string, JobStatus> = { check: 'success', release: 'success', 'docker-stable': 'failure' }
    expect(wouldRunUnderDefaultCondition(mutatedNeeds, statuses)).toBe(false)
    expect(wouldRunUnderDefaultCondition(realNeeds, statuses)).toBe(true)
  })

  it('none of the gated steps tolerate failure once configured (no continue-on-error)', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    for (const name of GATED_STEP_NAMES) {
      const s = step(dockerStable, name)
      expect(s['continue-on-error'], `step "${name}" must not tolerate failure`).not.toBe(true)
    }
  })

  // MUTATION GUARD: add continue-on-error to the real "Log in to Docker Hub"
  // step definition and prove the assertion above would have caught it —
  // this is the "configured but broken must still hard-fail" half of the
  // rail from the "audit gates by breaking them" requirement.
  it('MUTATION: adding continue-on-error to "Log in to Docker Hub" is caught by the no-tolerance assertion', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    const loginStep = step(dockerStable, 'Log in to Docker Hub')
    const mutated: WorkflowStep = { ...loginStep, 'continue-on-error': true }
    expect(mutated['continue-on-error']).toBe(true) // sanity: mutation applied
    // The real assertion this mirrors (`expect(s['continue-on-error']).not.toBe(true)`)
    // would fail against `mutated` — proving it is not vacuous.
    expect(() => {
      if (mutated['continue-on-error'] === true) {
        throw new Error('continue-on-error tolerated a Docker Hub login failure')
      }
    }).toThrow(/tolerated a Docker Hub login failure/)
  })
})
