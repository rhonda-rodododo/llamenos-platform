import { describe, it, expect, vi, type Mock } from 'vitest'
import {
  runVerifyCi, runReviewCi, laneIdFromBranch, verdictSummary, ciContextFromEnv,
  NOT_A_FLEET_PR, REVIEW_KEY_ENV, type CiContext, type VerifyCiDeps, type ReviewCiDeps,
} from '../../orchestrator/src/ci.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { VerifyInput, VerifyReport } from '../../orchestrator/src/verify.js'

const lane = (): Lane => ({
  id: 'ios', mode: 'off', cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable', vetoLabels: ['needs-human'],
  scope: { owned: ['apps/ios/'], notOwned: [] },
})

const ctx = (over: Partial<CiContext> = {}): CiContext =>
  ({ branch: 'fleet/ios/123', worktree: '/wt', pr: '42', ...over })

const passing: VerifyReport = {
  passed: true, reasons: [], changedFiles: ['apps/ios/a.swift'], addedLines: 3,
  impact: 'low', impactReasons: [], testsRun: ['orchestrator'], testsPassed: true, verifiedCommit: 'c0ffee',
}

describe('laneIdFromBranch', () => {
  it('derives the lane from a fleet branch', () => {
    expect(laneIdFromBranch('fleet/ios/123')).toBe('ios')
  })
  it.each(['main', 'feat/whatever', 'fleet/ios', 'fleet/ios/123/extra', 'notfleet/ios/1'])(
    'returns undefined for %s', (b) => { expect(laneIdFromBranch(b)).toBeUndefined() })
})

describe('verdictSummary', () => {
  it('prefers the reviewer\'s own VERDICT line', () => {
    expect(verdictSummary('some preamble\nVERDICT: FAIL — scope creep\ntrailing')).toBe('VERDICT: FAIL — scope creep')
  })
  it('falls back to the first non-empty line when there is no verdict line', () => {
    expect(verdictSummary('\n\nengine exploded\nmore')).toBe('engine exploded')
  })
  it('never invents a summary for empty output', () => {
    expect(verdictSummary('   \n ')).toBe('(no reviewer output)')
  })
})

describe('ciContextFromEnv', () => {
  it('refuses to build a context without a branch', () => {
    expect(ciContextFromEnv({}, '/wt')).toBeUndefined()
    expect(ciContextFromEnv({ FLEET_CI_BRANCH: '' }, '/wt')).toBeUndefined()
  })
  it('builds one from the branch alone, defaulting the PR label', () => {
    expect(ciContextFromEnv({ FLEET_CI_BRANCH: 'fleet/ios/1', FLEET_CI_PR: '9' }, '/wt'))
      .toEqual({ branch: 'fleet/ios/1', worktree: '/wt', pr: '9' })
    expect(ciContextFromEnv({ FLEET_CI_BRANCH: 'fleet/ios/1' }, '/wt')?.pr).toBe('(unknown)')
  })
})

describe('fleet/verify in CI', () => {
  const deps = (over: Partial<VerifyCiDeps> = {}): VerifyCiDeps => ({
    ctx: ctx(),
    lanes: async () => [lane()],
    verify: vi.fn(async () => passing),
    ...over,
  })

  // Required checks apply to EVERY PR, so a human's branch has to satisfy
  // them trivially or the repo deadlocks — and the summary has to say that is
  // what happened, not imply a gate ran.
  it('passes trivially on a non-fleet branch, and never runs verification', async () => {
    const d = deps({ ctx: ctx({ branch: 'feat/human-work' }) })
    expect(await runVerifyCi(d)).toEqual({ ok: true, summary: NOT_A_FLEET_PR })
    expect(d.verify).not.toHaveBeenCalled()
  })

  it('passes with the gate trace as its summary when verification passes', async () => {
    expect(await runVerifyCi(deps())).toEqual({
      ok: true,
      summary: 'scope=pass impact=low tests=orchestrator:pass review=not-run sha=c0ffee',
    })
  })

  it('runs the diff-targeted tests — it must never quietly skip them', async () => {
    const d = deps()
    await runVerifyCi(d)
    const input = (d.verify as Mock).mock.calls[0]?.[0] as VerifyInput | undefined
    expect(input?.skipTests).not.toBe(true)
    expect(input?.lane.id).toBe('ios')
  })

  it('fails when scope fails, naming the offending path', async () => {
    const failed: VerifyReport = {
      ...passing, passed: false, testsRun: undefined, testsPassed: undefined,
      reasons: ['touched never-write paths: .env'],
    }
    const v = await runVerifyCi(deps({ verify: vi.fn(async () => failed) }))
    expect(v.ok).toBe(false)
    expect(v.summary).toContain('scope=fail(touched never-write paths: .env)')
  })

  // verifyMechanical already refuses to set `passed` for a real test failure;
  // this asserts the CI entry point carries that through rather than passing
  // on a report it did not read.
  it('fails when the tests failed, even though scope passed', async () => {
    const failed: VerifyReport = { ...passing, passed: false, testsPassed: false, reasons: ['diff-targeted tests failed'] }
    expect((await runVerifyCi(deps({ verify: vi.fn(async () => failed) }))).ok).toBe(false)
  })

  it('fails for a fleet branch naming a lane that does not exist', async () => {
    const d = deps({ ctx: ctx({ branch: 'fleet/nosuchlane/1' }) })
    const v = await runVerifyCi(d)
    expect(v.ok).toBe(false)
    expect(v.summary).toContain('unknown lane "nosuchlane"')
    expect(d.verify).not.toHaveBeenCalled()
  })
})

describe('fleet/review in CI', () => {
  const deps = (over: Partial<ReviewCiDeps> = {}): ReviewCiDeps => ({
    ctx: ctx(),
    apiKey: 'a-key',
    lanes: async () => [lane()],
    verify: vi.fn(async () => passing),
    prDiff: vi.fn(async () => 'diff --git a/x b/x'),
    secondOpinion: vi.fn(async () => ({ verdict: 'PASS' as const, text: 'looks fine\nVERDICT: PASS' })),
    ...over,
  })

  it('passes trivially on a non-fleet branch without needing a key', async () => {
    const d = deps({ ctx: ctx({ branch: 'main' }), apiKey: undefined })
    expect(await runReviewCi(d)).toEqual({ ok: true, summary: NOT_A_FLEET_PR })
    expect(d.secondOpinion).not.toHaveBeenCalled()
  })

  // A missing secret must FAIL, never skip and never pass: a review that
  // could not run is not a review that passed.
  it.each([undefined, ''])('fails, naming the secret, when the review key is %p', async (apiKey) => {
    const d = deps({ apiKey })
    const v = await runReviewCi(d)
    expect(v.ok).toBe(false)
    expect(v.summary).toContain(REVIEW_KEY_ENV)
    expect(d.secondOpinion).not.toHaveBeenCalled()
  })

  it('passes, carrying the reviewer\'s own verdict line, on PASS', async () => {
    const v = await runReviewCi(deps())
    expect(v.ok).toBe(true)
    expect(v.summary).toContain('VERDICT: PASS')
  })

  it('fails on FAIL, carrying the reviewer\'s reason', async () => {
    const v = await runReviewCi(deps({
      secondOpinion: vi.fn(async () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL — widens scope' })),
    }))
    expect(v.ok).toBe(false)
    expect(v.summary).toContain('VERDICT: FAIL — widens scope')
    expect(v.summary).not.toContain('review unavailable')
  })

  // "The reviewer could not be run" and "the reviewer found a problem" both
  // fail the job, but they are different facts and the summary says which.
  it('fails and says the review was UNAVAILABLE when the verdict is UNREADABLE', async () => {
    const v = await runReviewCi(deps({
      secondOpinion: vi.fn(async () => ({ verdict: 'UNREADABLE' as const, text: '(reviewer engine was unreachable)' })),
    }))
    expect(v.ok).toBe(false)
    expect(v.summary).toContain('review unavailable: (reviewer engine was unreachable)')
  })

  it('fails and says UNAVAILABLE when secondOpinion throws (a tamper detection, a crashed engine)', async () => {
    const v = await runReviewCi(deps({
      secondOpinion: vi.fn(async () => { throw new Error('worktree changed mid-review') }),
    }))
    expect(v.ok).toBe(false)
    expect(v.summary).toContain('review unavailable: worktree changed mid-review')
  })

  // The same invariant secondOpinion enforces by throwing: a review may only
  // downgrade a mechanical pass, never rescue a failure.
  it('requests no review at all for a diff that failed scope', async () => {
    const failed: VerifyReport = {
      ...passing, passed: false,
      reasons: ['touched files outside lane "ios"\'s scope: apps/worker/x.ts'],
    }
    const d = deps({ verify: vi.fn(async () => failed) })
    const v = await runReviewCi(d)
    expect(v.ok).toBe(false)
    expect(v.summary).toContain('no review requested')
    expect(d.secondOpinion).not.toHaveBeenCalled()
  })

  // fleet/verify is the job that runs the tests; running them twice doubles
  // every fleet PR's CI cost for no extra signal.
  it('re-checks scope but does not re-run the diff-targeted tests', async () => {
    const d = deps()
    await runReviewCi(d)
    expect(((d.verify as Mock).mock.calls[0]?.[0] as VerifyInput | undefined)?.skipTests).toBe(true)
  })

  it('asks the non-author engine, derived from the lane that wrote the diff', async () => {
    const d = deps()
    await runReviewCi(d)
    expect(d.secondOpinion).toHaveBeenCalledWith(
      expect.objectContaining({ authorEngine: 'claude', pr: '42', worktree: '/wt' }))
  })
})
