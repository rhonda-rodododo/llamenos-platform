/**
 * macOS signing must SKIP cleanly when no Apple Developer credentials are
 * configured, and must still HARD-FAIL when credentials are present but
 * broken.
 *
 * Release 0.19.15 (CI run 35560197333) succeeded on Linux and Windows —
 * real, signed installers with `.sig` files — but macOS failed with:
 *
 *   Signing with identity ""
 *   : no identity found
 *   failed to bundle project failed codesign application: failed to run
 *   command codesign: failed to sign app
 *
 * `APPLE_SIGNING_IDENTITY` is genuinely unconfigured in this repo (#741 —
 * no paid Apple Developer account yet, tracked separately). The "Setup
 * macOS signing" step already guarded the keychain-import work behind
 * `if [ -n "$APPLE_CERTIFICATE" ]`, but the later "Build (macOS universal)"
 * step passed `APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}`
 * unconditionally. An unset GitHub secret interpolates to an EMPTY STRING in
 * an `env:` block, not an absent variable — so Tauri saw a set-but-empty
 * identity and attempted `codesign` with `""`, which hard-fails. That took
 * down the whole macOS leg (and with it, `release: needs: [build]`, since a
 * matrix job with any failing leg reports overall failure) even though
 * Linux and Windows had already produced real artifacts.
 *
 * The fix: "Setup macOS signing" now exports
 * `APPLE_SIGNING_IDENTITY`/`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` (and a
 * `APPLE_SIGNING_CONFIGURED` flag) to `$GITHUB_ENV` ONLY inside the
 * `APPLE_CERTIFICATE`-present branch. "Build (macOS universal)" no longer
 * references those secrets in its own `env:` block at all, so when no
 * certificate is configured the variable is genuinely UNSET in that step's
 * process environment (not empty) and Tauri skips signing instead of
 * failing. "Verify macOS notarization" — which must keep hard-failing on a
 * bad staple whenever credentials ARE present — is now gated on
 * `env.APPLE_SIGNING_CONFIGURED == 'true'`; a new "Report unsigned macOS
 * build" step covers the not-configured case and never fails the job, but
 * logs plainly that the bundle is unsigned (it will hit Gatekeeper on a
 * tester's Mac — #741 tracks fixing that for real).
 *
 * This is the rail that keeps the two outcomes distinct: "not configured"
 * (build succeeds, unsigned, loud log) must never regress back into hard
 * failure, and "configured but broken" must never regress into a silent
 * skip.
 *
 * Mutation check performed while authoring this test (see PR body for the
 * actual command output):
 *   1. Restoring the unconditional `APPLE_SIGNING_IDENTITY: ${{ secrets... }}`
 *      pass-through on "Build (macOS universal)" makes
 *      "does not leak Apple secrets into Build (macOS universal)'s env"
 *      fail (the key reappears in that step's `env:` block).
 *   2. Wrapping "Verify macOS notarization"'s failure paths in `|| true`
 *      (or adding `continue-on-error: true`) makes
 *      "still hard-fails when credentials are configured" fail (the
 *      `exit 1` count / continue-on-error assertions catch it).
 */

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')
const WORKFLOW_PATH = resolve(REPO_ROOT, '.github/workflows/tauri-release.yml')

type Step = { name: string; if?: string; env?: Record<string, string>; run?: string; 'continue-on-error'?: boolean }

function loadBuildSteps(): Step[] {
  const doc = parseYaml(readFileSync(WORKFLOW_PATH, 'utf-8'))
  const steps = doc?.jobs?.build?.steps
  if (!Array.isArray(steps)) throw new Error('could not parse jobs.build.steps from tauri-release.yml')
  return steps
}

function stepByName(steps: Step[], name: string): Step {
  const step = steps.find((s) => s.name === name)
  if (!step) throw new Error(`step "${name}" not found in build job`)
  return step
}

/** `step.run` is optional on the `Step` type (a `uses:` step has none) — this
 * asserts the specific step we looked up by name is a `run:` step, without a
 * non-null assertion at the call site. */
function requiredRun(step: Step): string {
  if (!step.run) throw new Error(`step "${step.name}" has no run: script`)
  return step.run
}

/**
 * Executes a step's `run:` script in real bash, with a scratch `$GITHUB_ENV`
 * file and a controlled environment/PATH — the same mechanism GitHub Actions
 * itself uses to pass values between steps in a job.
 */
function runStepScript(
  script: string,
  env: Record<string, string>,
  extraPathDir?: string,
): { status: number; githubEnv: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tauri-macos-signing-'))
  const githubEnvPath = join(dir, 'github_env')
  writeFileSync(githubEnvPath, '')
  const scriptPath = join(dir, 'run.sh')
  writeFileSync(scriptPath, `set -euo pipefail\n${script}`)
  chmodSync(scriptPath, 0o755)
  const PATH = extraPathDir ? `${extraPathDir}:${process.env.PATH}` : (process.env.PATH ?? '')

  let status = 0
  try {
    execFileSync('bash', [scriptPath], {
      env: { ...env, GITHUB_ENV: githubEnvPath, PATH },
      stdio: 'pipe',
    })
  } catch (e) {
    status = (e as { status?: number }).status ?? 1
  }
  const githubEnv = readFileSync(githubEnvPath, 'utf-8')
  rmSync(dir, { recursive: true, force: true })
  return { status, githubEnv }
}

/** `security` is macOS-only; stub it so the "configured" branch can run on any host. */
function makeFakeSecurityBin(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tauri-macos-signing-bin-'))
  const bin = join(dir, 'security')
  writeFileSync(bin, '#!/bin/bash\nexit 0\n')
  chmodSync(bin, 0o755)
  return dir
}

test.describe('macOS signing — not configured (APPLE_CERTIFICATE unset)', () => {
  test('"Setup macOS signing" succeeds and exports APPLE_SIGNING_CONFIGURED=false without ever writing an APPLE_SIGNING_IDENTITY line', () => {
    const steps = loadBuildSteps()
    const step = stepByName(steps, 'Setup macOS signing')
    const { status, githubEnv } = runStepScript(requiredRun(step), {
      APPLE_CERTIFICATE: '',
      APPLE_CERTIFICATE_PASSWORD: '',
      APPLE_SIGNING_IDENTITY: '',
      APPLE_ID: '',
      APPLE_PASSWORD: '',
      APPLE_TEAM_ID: '',
    })

    expect(status).toBe(0)
    expect(githubEnv).toContain('APPLE_SIGNING_CONFIGURED=false')
    // The bug: this line must never appear when there is no certificate —
    // its presence (even empty) is what let Tauri attempt codesign with "".
    expect(githubEnv).not.toContain('APPLE_SIGNING_IDENTITY=')
  })

  test('"Build (macOS universal)" never references Apple signing secrets in its own env — they can only arrive via $GITHUB_ENV', () => {
    const steps = loadBuildSteps()
    const step = stepByName(steps, 'Build (macOS universal)')
    const env = step.env ?? {}

    // This is the exact regression this PR fixes: an unconditional
    // `APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}` here
    // interpolates to an empty string (not an absent var) when the secret
    // is unset, and Tauri hard-fails signing with identity "".
    expect(env).not.toHaveProperty('APPLE_SIGNING_IDENTITY')
    expect(env).not.toHaveProperty('APPLE_ID')
    expect(env).not.toHaveProperty('APPLE_PASSWORD')
    expect(env).not.toHaveProperty('APPLE_TEAM_ID')

    // The updater signing key is a different credential (not Apple's) and
    // must still be present unconditionally — this build still needs to
    // produce a validly-signed update artifact even when unsigned by Apple.
    expect(env).toHaveProperty('TAURI_SIGNING_PRIVATE_KEY')
    expect(env).toHaveProperty('TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
  })

  test('"Verify macOS notarization" is skipped and "Report unsigned macOS build" runs instead, without failing the job', () => {
    const steps = loadBuildSteps()
    const verify = stepByName(steps, 'Verify macOS notarization')
    const report = stepByName(steps, 'Report unsigned macOS build')

    expect(verify.if).toMatch(/APPLE_SIGNING_CONFIGURED\s*==\s*'true'/)
    expect(report.if).toMatch(/APPLE_SIGNING_CONFIGURED\s*!=\s*'true'/)

    // The unsigned-build report must be informative but must NEVER be able
    // to fail the job — that would collapse "not configured" back into a
    // hard failure, which is the exact bug this PR fixes.
    expect(report.run).not.toMatch(/exit\s+1\b/)
    expect(report['continue-on-error']).not.toBe(false)
  })
})

test.describe('macOS signing — configured (APPLE_CERTIFICATE present)', () => {
  test('"Setup macOS signing" exports APPLE_SIGNING_CONFIGURED=true and the real identity/notarization values', () => {
    const steps = loadBuildSteps()
    const step = stepByName(steps, 'Setup macOS signing')
    const fakeBin = makeFakeSecurityBin()
    try {
      const { status, githubEnv } = runStepScript(
        requiredRun(step),
        {
          APPLE_CERTIFICATE: Buffer.from('dummy-cert-bytes-for-test').toString('base64'),
          APPLE_CERTIFICATE_PASSWORD: 'test-cert-password',
          APPLE_SIGNING_IDENTITY: 'Developer ID Application: Test Org (ABC1234567)',
          APPLE_ID: 'ci-test@example.com',
          APPLE_PASSWORD: 'app-specific-password',
          APPLE_TEAM_ID: 'TEAM1234',
        },
        fakeBin,
      )

      expect(status).toBe(0)
      expect(githubEnv).toContain('APPLE_SIGNING_CONFIGURED=true')
      expect(githubEnv).toContain('APPLE_SIGNING_IDENTITY=Developer ID Application: Test Org (ABC1234567)')
      expect(githubEnv).toContain('APPLE_ID=ci-test@example.com')
      expect(githubEnv).toContain('APPLE_PASSWORD=app-specific-password')
      expect(githubEnv).toContain('APPLE_TEAM_ID=TEAM1234')
    } finally {
      rmSync(fakeBin, { recursive: true, force: true })
    }
  })

  test('"Verify macOS notarization" still hard-fails when credentials are configured but signing is broken — it is never made tolerant of errors', () => {
    const steps = loadBuildSteps()
    const verify = stepByName(steps, 'Verify macOS notarization')

    // Both failure paths (missing .app bundle; spctl assessment failed AND
    // staple invalid) must still exit non-zero. A "tolerant" mutation
    // (wrapping these in `|| true`, or downgrading them to `::warning::`
    // only) is exactly what would let a genuinely broken certificate slip
    // through as a false "success" — the opposite of the "not configured"
    // skip this PR adds.
    const exitOneCount = (verify.run?.match(/exit\s+1\b/g) ?? []).length
    expect(exitOneCount).toBeGreaterThanOrEqual(2)
    expect(verify['continue-on-error']).not.toBe(true)

    // And it must only run at all once configured — never unconditionally
    // on every macOS build (that was the pre-fix behavior, which is exactly
    // what made an unsigned build fail even though it built successfully).
    expect(verify.if).toContain("matrix.platform == 'macos-latest'")
    expect(verify.if).toMatch(/APPLE_SIGNING_CONFIGURED\s*==\s*'true'/)
  })
})
