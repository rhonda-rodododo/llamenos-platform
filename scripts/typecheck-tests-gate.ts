#!/usr/bin/env bun
/**
 * Type-check tests/ against a per-file error-count baseline.
 *
 * G3 (CI gate audit, 2026-09-11): `tsc --noEmit` never covered tests/,
 * scripts/, or signal-notifier/, so real type errors there went
 * undetected. scripts/ and signal-notifier/ are now clean and covered by
 * strict `tsc --noEmit` in CI. tests/ still has 80 pre-existing errors
 * across 27 files (see .github/ci/tsc-tests-baseline.json) — fixing all of
 * them is tracked at
 * https://github.com/rhonda-rodododo/llamenos-platform/issues/648 rather
 * than blocking this PR.
 *
 * This script fails CI if:
 *   - a file has MORE errors than its baseline count, or
 *   - a file has errors but is not in the baseline at all (a new offender)
 * It does not fail when a file's error count matches or improves on its
 * baseline. When you fix errors, re-run with `--write-baseline` to shrink
 * the baseline file accordingly — never widen it to make new errors pass.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const BASELINE_PATH = '.github/ci/tsc-tests-baseline.json'
const TSCONFIG = 'tsconfig.tests.json'

const writeBaseline = process.argv.includes('--write-baseline')

const result = spawnSync('bunx', ['tsc', '--noEmit', '-p', TSCONFIG], {
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const counts: Record<string, number> = {}
const errorLineRe = /^(tests\/[^(]+)\(\d+,\d+\): error TS\d+/

for (const line of output.split('\n')) {
  const m = errorLineRe.exec(line)
  if (m) {
    const file = m[1]
    counts[file] = (counts[file] ?? 0) + 1
  }
}

const totalCurrent = Object.values(counts).reduce((a, b) => a + b, 0)

if (writeBaseline) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`)
  console.log(`Wrote ${BASELINE_PATH} with ${totalCurrent} errors across ${Object.keys(counts).length} files.`)
  process.exit(0)
}

const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))

const regressions: string[] = []
for (const [file, count] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0
  if (count > allowed) {
    regressions.push(`  ${file}: ${count} errors (baseline allows ${allowed})`)
  }
}

const improved: string[] = []
for (const [file, allowed] of Object.entries(baseline)) {
  const count = counts[file] ?? 0
  if (count < allowed) {
    improved.push(`  ${file}: ${count} errors (baseline allowed ${allowed})`)
  }
}

if (improved.length > 0) {
  console.log('Some files improved on their baseline — shrink .github/ci/tsc-tests-baseline.json:')
  console.log(improved.join('\n'))
}

if (regressions.length > 0) {
  console.error('New or worsened type errors in tests/ (not in baseline):')
  console.error(regressions.join('\n'))
  console.error('')
  console.error('Fix the new errors, or if truly baseline-eligible pre-existing debt,')
  console.error('regenerate with: bun scripts/typecheck-tests-gate.ts --write-baseline')
  console.error('(only after confirming every added line is pre-existing debt, not new).')
  process.exit(1)
}

console.log(`tests/ typecheck gate passed: ${totalCurrent} errors, all within baseline (${BASELINE_PATH}).`)
