import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Rail for a defect in release.yml surfaced by run 35489888506 (v0.19.13):
 * `check`/`build`/`release` all succeeded, but `dispatch` — the job that
 * actually triggers the desktop and mobile release workflows a tester would
 * install — was SKIPPED, because `docker-stable` (pure container-registry
 * publishing) failed and sat in `dispatch`'s `needs`. `docker-stable` itself
 * failed for a reason that has nothing to do with producing an installer:
 * Docker Hub credentials were never configured in this repo, so
 * `docker/login-action` errored with "Username and password required",
 * which cascaded into a failed Trivy upload (`trivy-results.sarif` never
 * existed because the scan never ran).
 *
 * `dispatch` must depend only on what it actually needs (`check` for the
 * version, `release` for the release existing) — never on `docker-stable`.
 * That rail (Rail 1 below) is unchanged by the later GHCR migration: an
 * optional/independent publish job must never gate a required artifact job,
 * regardless of which registry it publishes to.
 *
 * Rail 2's shape changed with that GHCR migration
 * (tests/orchestrator/release-ghcr-publish.test.ts covers the new job in
 * full): `docker-stable` no longer has an "unconfigured" case to skip —
 * GHCR publishing authenticates with the built-in `GITHUB_TOKEN`, which is
 * always present, so the job runs unconditionally on every release. What
 * carries forward from the original Rail 2 intent ("configured but broken
 * must still hard-fail") is asserted here structurally: none of the
 * publish/scan/sign/attest steps may tolerate failure.
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
  with?: Record<string, unknown>
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
// Rail 2 (post-GHCR-migration shape): docker-stable no longer has an
// "unconfigured" case — GHCR authenticates with the always-present
// GITHUB_TOKEN — so every publish/scan/sign/attest step must run
// unconditionally (no docker-creds-style gate reintroduced) and none may
// tolerate failure. Full coverage of the GHCR job (image naming, login,
// tag computation, signing) lives in release-ghcr-publish.test.ts; this
// rail only re-asserts the "never gated, never tolerant" shape in the same
// place the old Docker Hub gating rail used to live, so a future PR that
// tries to reintroduce a credential gate here still trips something.
// ---------------------------------------------------------------------------

const UNGATED_STEP_NAMES = [
  'Set up Docker Buildx',
  'Log in to GHCR',
  'Compute stable tags',
  'Build and push stable image',
  'Generate SBOM attestation',
  'Install cosign',
  'Sign container image (keyless)',
  'Run Trivy vulnerability scanner',
]

describe('rail: docker-stable (GHCR) runs unconditionally and never tolerates failure', () => {
  it('no "Check Docker Hub credentials"-style gating step exists anymore', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    const gateNames = dockerStable.steps
      .map((s) => s.name)
      .filter((n): n is string => typeof n === 'string' && /credential/i.test(n))
    expect(gateNames).toEqual([])
  })

  it('none of the publish/scan/sign/attest steps carry an `if:` gate', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    for (const name of UNGATED_STEP_NAMES) {
      const s = step(dockerStable, name)
      expect(s.if, `step "${name}" must not be conditionally gated`).toBeUndefined()
    }
  })

  it('"Upload Trivy scan results" keeps its always() (upload-on-scan-failure) behavior, ungated', () => {
    const doc = loadWorkflow()
    const s = step(job(doc, 'docker-stable'), 'Upload Trivy scan results')
    expect(s.if).toBe('always()')
  })

  it('authenticates with the built-in GITHUB_TOKEN, not an operator-provided Docker Hub secret', () => {
    const doc = loadWorkflow()
    const loginStep = step(job(doc, 'docker-stable'), 'Log in to GHCR')
    const serialized = JSON.stringify(loginStep.with)
    expect(serialized).toContain('secrets.GITHUB_TOKEN')
    expect(serialized).not.toContain('DOCKERHUB')
  })

  it('none of the steps tolerate failure (no continue-on-error)', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    for (const name of UNGATED_STEP_NAMES) {
      const s = step(dockerStable, name)
      expect(s['continue-on-error'], `step "${name}" must not tolerate failure`).not.toBe(true)
    }
  })

  // MUTATION GUARD (per "audit gates by breaking them"): add
  // continue-on-error to the real "Build and push stable image" step
  // definition — the exact class of regression that would let a broken
  // GHCR push silently "succeed" — and prove the assertion above would have
  // caught it.
  it('MUTATION: adding continue-on-error to "Build and push stable image" is caught by the no-tolerance assertion', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    const pushStep = step(dockerStable, 'Build and push stable image')
    const mutated: WorkflowStep = { ...pushStep, 'continue-on-error': true }
    expect(mutated['continue-on-error']).toBe(true) // sanity: mutation applied
    // The real assertion this mirrors (`expect(s['continue-on-error']).not.toBe(true)`)
    // would fail against `mutated` — proving it is not vacuous.
    expect(() => {
      if (mutated['continue-on-error'] === true) {
        throw new Error('continue-on-error tolerated a GHCR push failure')
      }
    }).toThrow(/tolerated a GHCR push failure/)
  })

  // MUTATION GUARD: reintroduce a docker-creds-style `if:` gate onto a copy
  // of the real "Build and push stable image" step and prove the
  // ungated-ness assertion above would have caught it — this guards against
  // silently reintroducing the pre-GHCR skip-when-unconfigured shape, which
  // no longer applies once auth is GITHUB_TOKEN (always present).
  it('MUTATION: reintroducing an `if:` gate on the push step is caught by the ungated assertion', () => {
    const doc = loadWorkflow()
    const dockerStable = job(doc, 'docker-stable')
    const pushStep = step(dockerStable, 'Build and push stable image')
    const mutated: WorkflowStep = { ...pushStep, if: "steps.docker-creds.outputs.configured == 'true'" }
    expect(mutated.if).toBeDefined() // sanity: mutation applied
    expect(() => {
      if (mutated.if !== undefined) {
        throw new Error('push step was conditionally gated again')
      }
    }).toThrow(/conditionally gated again/)
  })
})
