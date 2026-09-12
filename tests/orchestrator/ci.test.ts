import { describe, it, expect, vi } from 'vitest'
import {
  runVerifyCi, runReviewCi, laneIdFromBranch, shortDescription, verdictSummary, ciContextFromEnv,
  VERIFY_CONTEXT, REVIEW_CONTEXT, NOT_A_FLEET_PR, REVIEW_KEY_ENV, DESCRIPTION_MAX,
  type CiContext, type StatusState,
} from '../../orchestrator/src/ci.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { VerifyInput, VerifyReport } from '../../orchestrator/src/verify.js'

const lane = (): Lane => ({
  id: 'ios', mode: 'off', cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable', vetoLabels: ['needs-human'],
  scope: { owned: ['apps/ios/'], notOwned: [] },
})

const ctx = (over: Partial<CiContext> = {}): CiContext =>
  ({ branch: 'fleet/ios/123', sha: 'c0ffee', worktree: '/wt', pr: '42', ...over })

const passing: VerifyReport = {
  passed: true, reasons: [], changedFiles: ['apps/ios/a.swift'], addedLines: 3,
  impact: 'low', impactReasons: [], testsRun: ['orchestrator'], testsPassed: true, verifiedCommit: 'c0ffee',
}

interface Posted { context: string; state: StatusState; description: string }

function recorder(): { posted: Posted[]; postStatus: (c: string, s: StatusState, d: string) => Promise<void> } {
  const posted: Posted[] = []
  return {
    posted,
    postStatus: async (context, state, description) => { posted.push({ context, state, description }) },
  }
}

describe('laneIdFromBranch', () => {
  it('derives the lane from a fleet branch', () => {
    expect(laneIdFromBranch('fleet/ios/123')).toBe('ios')
  })
  it.each(['main', 'feat/whatever', 'fleet/ios', 'fleet/ios/123/extra', 'notfleet/ios/1'])(
    'returns undefined for %s', (b) => { expect(laneIdFromBranch(b)).toBeUndefined() })
})

describe('shortDescription', () => {
  it('leaves a short description alone', () => {
    expect(shortDescription('scope=pass impact=low')).toBe('scope=pass impact=low')
  })
  it('collapses newlines so a multi-line trace stays one status line', () => {
    expect(shortDescription('a\n  b\tc')).toBe('a b c')
  })
  // GitHub silently truncates past 140; truncating here makes it visible.
  it('never exceeds GitHub\'s limit, and marks that it truncated', () => {
    const out = shortDescription('x'.repeat(500))
    expect(out.length).toBe(DESCRIPTION_MAX)
    expect(out.endsWith('…')).toBe(true)
  })
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
  it('refuses to build a context without both branch and sha', () => {
    expect(ciContextFromEnv({ FLEET_CI_BRANCH: 'fleet/ios/1' }, '/wt')).toBeUndefined()
    expect(ciContextFromEnv({ FLEET_CI_SHA: 'abc' }, '/wt')).toBeUndefined()
    expect(ciContextFromEnv({ FLEET_CI_BRANCH: '', FLEET_CI_SHA: 'abc' }, '/wt')).toBeUndefined()
  })
  it('builds one when both are present', () => {
    expect(ciContextFromEnv({ FLEET_CI_BRANCH: 'fleet/ios/1', FLEET_CI_SHA: 'abc', FLEET_CI_PR: '9' }, '/wt'))
      .toEqual({ branch: 'fleet/ios/1', sha: 'abc', worktree: '/wt', pr: '9' })
  })
})

describe('fleet/verify in CI', () => {
  const deps = (over: Partial<Parameters<typeof runVerifyCi>[0]> = {}) => {
    const r = recorder()
    return {
      r,
      d: {
        ctx: ctx(),
        lanes: async () => [lane()],
        verify: vi.fn(async () => passing),
        postStatus: r.postStatus,
        log: () => {},
        ...over,
      },
    }
  }

  // Required status checks apply to EVERY PR, so a human's branch has to
  // satisfy them trivially or the repo deadlocks — and the description has
  // to say that is what happened, not imply a gate ran.
  it('posts success/"not a fleet PR" on a non-fleet branch, and never runs verification', async () => {
    const { r, d } = deps({ ctx: ctx({ branch: 'feat/human-work' }) })
    expect(await runVerifyCi(d)).toBe(0)
    expect(r.posted).toEqual([{ context: VERIFY_CONTEXT, state: 'success', description: NOT_A_FLEET_PR }])
    expect(d.verify).not.toHaveBeenCalled()
  })

  it('posts success with the gate trace when verification passes', async () => {
    const { r, d } = deps()
    expect(await runVerifyCi(d)).toBe(0)
    expect(r.posted).toHaveLength(1)
    expect(r.posted[0]?.context).toBe(VERIFY_CONTEXT)
    expect(r.posted[0]?.state).toBe('success')
    expect(r.posted[0]?.description).toBe('scope=pass impact=low tests=orchestrator:pass review=not-run sha=c0ffee')
  })

  it('runs the diff-targeted tests — it must never quietly skip them', async () => {
    const { d } = deps()
    await runVerifyCi(d)
    const input = (d.verify as unknown as { mock: { calls: [VerifyInput][] } }).mock.calls[0]?.[0]
    expect(input?.skipTests).not.toBe(true)
    expect(input?.lane.id).toBe('ios')
  })

  it('posts failure and exits non-zero when scope fails', async () => {
    const failed: VerifyReport = {
      ...passing, passed: false, testsRun: undefined, testsPassed: undefined,
      reasons: ['touched never-write paths: .env'],
    }
    const { r, d } = deps({ verify: vi.fn(async () => failed) })
    expect(await runVerifyCi(d)).toBe(1)
    expect(r.posted[0]?.state).toBe('failure')
    expect(r.posted[0]?.description).toContain('scope=fail(touched never-write paths: .env)')
  })

  // An unproven test run is not a passed one: verifyMechanical already
  // refuses to set `passed` for a real failure, and this asserts the CI job
  // carries that through rather than posting green on a report it did not read.
  it('posts failure when the tests failed, even though scope passed', async () => {
    const failed: VerifyReport = { ...passing, passed: false, testsPassed: false, reasons: ['diff-targeted tests failed'] }
    const { r, d } = deps({ verify: vi.fn(async () => failed) })
    expect(await runVerifyCi(d)).toBe(1)
    expect(r.posted[0]?.state).toBe('failure')
  })

  it('posts failure for a fleet branch naming a lane that does not exist', async () => {
    const { r, d } = deps({ ctx: ctx({ branch: 'fleet/nosuchlane/1' }) })
    expect(await runVerifyCi(d)).toBe(1)
    expect(r.posted[0]).toMatchObject({ context: VERIFY_CONTEXT, state: 'failure' })
    expect(d.verify).not.toHaveBeenCalled()
  })
})

describe('fleet/review in CI', () => {
  const deps = (over: Partial<Parameters<typeof runReviewCi>[0]> = {}) => {
    const r = recorder()
    return {
      r,
      d: {
        ctx: ctx(),
        apiKey: 'a-key',
        lanes: async () => [lane()],
        verify: vi.fn(async () => passing),
        prDiff: vi.fn(async () => 'diff --git a/x b/x'),
        secondOpinion: vi.fn(async () => ({ verdict: 'PASS' as const, text: 'looks fine\nVERDICT: PASS' })),
        postStatus: r.postStatus,
        log: () => {},
        ...over,
      },
    }
  }

  it('posts success/"not a fleet PR" on a non-fleet branch without needing a key', async () => {
    const { r, d } = deps({ ctx: ctx({ branch: 'main' }), apiKey: undefined })
    expect(await runReviewCi(d)).toBe(0)
    expect(r.posted).toEqual([{ context: REVIEW_CONTEXT, state: 'success', description: NOT_A_FLEET_PR }])
    expect(d.secondOpinion).not.toHaveBeenCalled()
  })

  // A missing secret must FAIL, never skip and never pass: a review that
  // could not run is not a review that passed.
  it.each([undefined, ''])('posts error and exits non-zero when the review key is %p', async (apiKey) => {
    const { r, d } = deps({ apiKey })
    expect(await runReviewCi(d)).toBe(1)
    expect(r.posted[0]?.state).toBe('error')
    expect(r.posted[0]?.description).toContain(REVIEW_KEY_ENV)
    expect(d.secondOpinion).not.toHaveBeenCalled()
  })

  it('posts success with the reviewer\'s own verdict line on PASS', async () => {
    const { r, d } = deps()
    expect(await runReviewCi(d)).toBe(0)
    expect(r.posted).toEqual([{ context: REVIEW_CONTEXT, state: 'success', description: 'VERDICT: PASS' }])
  })

  it('posts failure on FAIL', async () => {
    const { r, d } = deps({
      secondOpinion: vi.fn(async () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL — widens scope' })),
    })
    expect(await runReviewCi(d)).toBe(1)
    expect(r.posted[0]).toMatchObject({ state: 'failure', description: 'VERDICT: FAIL — widens scope' })
  })

  // UNREADABLE is `error`, not `failure`: "the reviewer could not be run" and
  // "the reviewer found a problem" are different facts, and both block.
  it('posts error, not failure, when the review is UNREADABLE', async () => {
    const { r, d } = deps({
      secondOpinion: vi.fn(async () => ({ verdict: 'UNREADABLE' as const, text: '(reviewer engine was unreachable)' })),
    })
    expect(await runReviewCi(d)).toBe(1)
    expect(r.posted[0]?.state).toBe('error')
    expect(r.posted[0]?.description).toContain('review unavailable: (reviewer engine was unreachable)')
  })

  it('posts error when secondOpinion throws (a tamper detection, a crashed engine)', async () => {
    const { r, d } = deps({ secondOpinion: vi.fn(async () => { throw new Error('worktree changed mid-review') }) })
    expect(await runReviewCi(d)).toBe(1)
    expect(r.posted[0]?.state).toBe('error')
    expect(r.posted[0]?.description).toContain('worktree changed mid-review')
  })

  // The same invariant secondOpinion enforces by throwing: a review may only
  // downgrade a mechanical pass, never rescue a failure.
  it('requests no review at all for a diff that failed scope', async () => {
    const failed: VerifyReport = { ...passing, passed: false, reasons: ['touched files outside lane "ios"\'s scope: apps/worker/x.ts'] }
    const { r, d } = deps({ verify: vi.fn(async () => failed) })
    expect(await runReviewCi(d)).toBe(1)
    expect(d.secondOpinion).not.toHaveBeenCalled()
    expect(r.posted[0]?.state).toBe('failure')
    expect(r.posted[0]?.description).toContain('no review requested')
  })

  // fleet/verify is the job that runs the tests; running them twice doubles
  // every fleet PR's CI cost for no extra signal.
  it('re-checks scope but does not re-run the diff-targeted tests', async () => {
    const { d } = deps()
    await runReviewCi(d)
    const input = (d.verify as unknown as { mock: { calls: [VerifyInput][] } }).mock.calls[0]?.[0]
    expect(input?.skipTests).toBe(true)
  })

  it('asks the non-author engine, derived from the lane that wrote the diff', async () => {
    const { d } = deps()
    await runReviewCi(d)
    expect(d.secondOpinion).toHaveBeenCalledWith(expect.objectContaining({ authorEngine: 'claude', pr: '42', worktree: '/wt' }))
  })
})
