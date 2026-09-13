import { describe, it, expect } from 'vitest'
import { mayAutoMerge } from '../../orchestrator/src/merge.js'
import type { VerifyReport } from '../../orchestrator/src/verify.js'

const VERIFIED_SHA = 'abc123def456'

const ok = (over: Partial<VerifyReport> = {}): VerifyReport => ({
  passed: true, reasons: [], changedFiles: ['apps/worker/x.ts'], addedLines: 10,
  impact: 'low', impactReasons: [], testsPassed: true, verifiedCommit: VERIFIED_SHA, ...over,
})

describe('mayAutoMerge', () => {
  it('merges low-impact work with green CI and an approving non-author review', () => {
    expect(mayAutoMerge(ok(), true, 'PASS', VERIFIED_SHA).merge).toBe(true)
  })
  it('refuses when CI is not green', () => {
    expect(mayAutoMerge(ok(), false, 'PASS', VERIFIED_SHA).merge).toBe(false)
  })
  it('refuses when the review did not pass', () => {
    expect(mayAutoMerge(ok(), true, 'FAIL', VERIFIED_SHA).merge).toBe(false)
  })
  it('refuses when the review was unreadable', () => {
    expect(mayAutoMerge(ok(), true, 'UNREADABLE', VERIFIED_SHA).merge).toBe(false)
  })
  it('refuses high-impact work even with everything else green', () => {
    expect(mayAutoMerge(ok({ impact: 'high', impactReasons: ['crypto'] }), true, 'PASS', VERIFIED_SHA).merge).toBe(false)
  })
  it('refuses when mechanical verification failed', () => {
    expect(mayAutoMerge(ok({ passed: false, reasons: ['strayed'] }), true, 'PASS', VERIFIED_SHA).merge).toBe(false)
  })
  it('refuses when tests could not be established', () => {
    expect(mayAutoMerge(ok({ testsPassed: undefined }), true, 'PASS', VERIFIED_SHA).merge).toBe(false)
  })
  it('always gives a reason', () => {
    expect(mayAutoMerge(ok({ impact: 'high' }), true, 'PASS', VERIFIED_SHA).reason.length).toBeGreaterThan(0)
  })

  // --- Each AND condition, removed in isolation, must independently fail ---

  it('refuses when tests explicitly failed, even with everything else green', () => {
    expect(mayAutoMerge(ok({ testsPassed: false }), true, 'PASS', VERIFIED_SHA).merge).toBe(false)
  })
  it('a passing reason set still gives a truthful, non-empty reason on success', () => {
    const r = mayAutoMerge(ok(), true, 'PASS', VERIFIED_SHA)
    expect(r.merge).toBe(true)
    expect(r.reason.length).toBeGreaterThan(0)
  })
  it('reason on failure specifically names why, not a generic message repeated for every cause', () => {
    const ciReason = mayAutoMerge(ok(), false, 'PASS', VERIFIED_SHA).reason
    const reviewReason = mayAutoMerge(ok(), true, 'FAIL', VERIFIED_SHA).reason
    const impactReason = mayAutoMerge(ok({ impact: 'high' }), true, 'PASS', VERIFIED_SHA).reason
    const scopeReason = mayAutoMerge(ok({ passed: false, reasons: ['strayed'] }), true, 'PASS', VERIFIED_SHA).reason
    const testsReason = mayAutoMerge(ok({ testsPassed: undefined }), true, 'PASS', VERIFIED_SHA).reason
    const shaReason = mayAutoMerge(ok(), true, 'PASS', 'some-other-sha').reason
    const reasons = [ciReason, reviewReason, impactReason, scopeReason, testsReason, shaReason]
    // No two distinct failure causes should collapse to the identical reason
    // string — a merge gate that can't say WHY it refused is not auditable.
    expect(new Set(reasons).size).toBe(reasons.length)
  })
  it('never merges on a partial match of conditions — all must hold simultaneously', () => {
    // Every gate broken at once must still just refuse, not throw or merge.
    const broken = ok({ passed: false, reasons: ['strayed'], impact: 'high', testsPassed: undefined })
    expect(mayAutoMerge(broken, false, 'FAIL', 'unverified-sha').merge).toBe(false)
  })

  // --- W1 (fix round 2): the branch must not have moved since verification ---

  it('refuses when the PR head has moved past the verified commit, even with everything else green', () => {
    const result = mayAutoMerge(ok(), true, 'PASS', 'some-later-commit-sha')
    expect(result.merge).toBe(false)
  })
  it('the mismatch reason names both the verified commit and the current head', () => {
    const result = mayAutoMerge(ok(), true, 'PASS', 'some-later-commit-sha')
    expect(result.reason).toContain(VERIFIED_SHA)
    expect(result.reason).toContain('some-later-commit-sha')
    expect(result.reason).toMatch(/moved/i)
  })
  it('merges when the PR head exactly matches the recorded verified commit', () => {
    expect(mayAutoMerge(ok(), true, 'PASS', VERIFIED_SHA).merge).toBe(true)
  })
  it('uses the RECORDED verifiedCommit, not a value independent of what was actually verified', () => {
    // The whole point of W1 is that the comparison is against a value
    // `verifyMechanical` captured when it examined the tree — not a fresh
    // observation made here. Changing only the recorded field (holding the
    // "current" head fixed) must change the outcome: if this function were
    // instead deriving "what was verified" from something else (e.g.
    // ignoring the field entirely, or always trusting the caller's
    // currentHeadSha as correct-by-definition), this would not happen.
    const reportVerifiedAtOldSha = ok({ verifiedCommit: 'old-sha-from-when-verification-ran' })
    const reportVerifiedAtNewSha = ok({ verifiedCommit: 'new-sha-that-matches-head' })

    expect(mayAutoMerge(reportVerifiedAtOldSha, true, 'PASS', 'new-sha-that-matches-head').merge).toBe(false)
    expect(mayAutoMerge(reportVerifiedAtNewSha, true, 'PASS', 'new-sha-that-matches-head').merge).toBe(true)
  })
  it('refuses when verifiedCommit was never established at all', () => {
    const noRecord = ok({ verifiedCommit: undefined })
    expect(mayAutoMerge(noRecord, true, 'PASS', VERIFIED_SHA).merge).toBe(false)
  })
})
