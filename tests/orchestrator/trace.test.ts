import { describe, it, expect } from 'vitest'
import { buildGateTrace } from '../../orchestrator/src/trace.js'
import type { VerifyReport } from '../../orchestrator/src/verify.js'

const passingReport = (): VerifyReport => ({
  passed: true, reasons: [], changedFiles: ['apps/ios/a.swift'], addedLines: 3,
  impact: 'low', impactReasons: [], testsRun: ['orchestrator'], testsPassed: true, verifiedCommit: 'c0ffee',
})

describe('buildGateTrace', () => {
  it('reports every stage as not-run when nothing ran at all', () => {
    expect(buildGateTrace({})).toBe('scope=not-run impact=not-run tests=not-run review=not-run merge=not-run sha=none')
  })

  it('reports a fully-passing run', () => {
    const trace = buildGateTrace({
      report: passingReport(),
      reviewVerdict: 'PASS',
      decision: { merge: true, reason: 'all gates green' },
    })
    expect(trace).toBe('scope=pass impact=low tests=orchestrator:pass review=PASS merge=yes(all gates green) sha=c0ffee')
  })

  // The load-bearing case for G2's own test requirement: a run that stops at
  // the merge gate must carry the merge reason in the trace.
  it('carries the merge refusal reason when the merge gate stops it', () => {
    const trace = buildGateTrace({
      report: passingReport(),
      reviewVerdict: 'PASS',
      decision: { merge: false, reason: 'high-impact diff requires human review: touches deploy/' },
    })
    expect(trace).toContain('merge=no(high-impact diff requires human review: touches deploy/)')
  })

  it('reports scope failure distinctly from a test failure', () => {
    const scopeFailed: VerifyReport = {
      ...passingReport(), passed: false, testsRun: undefined, testsPassed: undefined,
      reasons: ['touched never-write paths: .env'],
    }
    expect(buildGateTrace({ report: scopeFailed })).toContain('scope=fail(touched never-write paths: .env)')
    expect(buildGateTrace({ report: scopeFailed })).toContain('tests=none')
  })

  it('reports a test failure with scope passing', () => {
    const testsFailed: VerifyReport = {
      ...passingReport(), passed: false, testsPassed: false, reasons: ['diff-targeted tests failed'],
    }
    const trace = buildGateTrace({ report: testsFailed })
    expect(trace).toContain('scope=pass')
    expect(trace).toContain('tests=orchestrator:fail')
  })

  it('reports an unproven test run distinctly from a real failure', () => {
    const unproven: VerifyReport = { ...passingReport(), testsPassed: undefined }
    expect(buildGateTrace({ report: unproven })).toContain('tests=orchestrator:unproven')
  })

  it('reports an infrastructure failure (no changed files, no scope check reached) as unknown', () => {
    const infra: VerifyReport = {
      passed: false, reasons: ['could not resolve HEAD in /wt — git rev-parse failed'],
      changedFiles: [], addedLines: 0, impact: 'low', impactReasons: [],
    }
    expect(buildGateTrace({ report: infra })).toContain('scope=unknown(could not resolve HEAD in /wt — git rev-parse failed)')
  })

  it('reports high impact with its first reason', () => {
    const highImpact: VerifyReport = { ...passingReport(), impact: 'high', impactReasons: ['deploy/x.yaml is under high-impact path deploy/', 'second reason'] }
    expect(buildGateTrace({ report: highImpact })).toContain('impact=high(deploy/x.yaml is under high-impact path deploy/)')
  })

  it('reports UNREADABLE with a truncated reason, distinct from FAIL', () => {
    const trace = buildGateTrace({ report: passingReport(), reviewVerdict: 'UNREADABLE', reviewText: '(reviewer engine was unreachable)' })
    expect(trace).toContain('review=UNREADABLE((reviewer engine was unreachable))')
  })

  it('reports review and merge as not-run when mechanical verification never passed', () => {
    const failing: VerifyReport = { ...passingReport(), passed: false, reasons: ['touched never-write paths: .env'] }
    const trace = buildGateTrace({ report: failing })
    expect(trace).toContain('review=not-run')
    expect(trace).toContain('merge=not-run')
  })

  // MUTATION GUARD: every value is an explicit string, never absent — a
  // regression that dropped a key silently (e.g. `undefined` interpolated
  // into the template, or a key omitted for the not-run case) is caught by
  // asserting every one of the six keys is always present.
  it('always emits all six keys, whatever the input', () => {
    for (const input of [{}, { report: passingReport() }, { reviewVerdict: 'FAIL' as const }]) {
      const trace = buildGateTrace(input)
      for (const key of ['scope=', 'impact=', 'tests=', 'review=', 'merge=', 'sha=']) {
        expect(trace).toContain(key)
      }
    }
  })
})
