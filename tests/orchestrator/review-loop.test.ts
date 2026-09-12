import { describe, it, expect, vi } from 'vitest'
import {
  runReviewLoop, MAX_REVIEW_ROUNDS, VerifierTamperedWorktreeError,
  type ReviewLoopDeps, type ReviewLoopInput, type SecondOpinionResult,
} from '../../orchestrator/src/review.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { VerifyReport } from '../../orchestrator/src/verify.js'

const lane: Lane = {
  id: 'backend', mode: 'live', cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable', vetoLabels: ['needs-human'],
  scope: { owned: ['apps/backend/'], notOwned: [] },
}

const input: ReviewLoopInput = {
  authorEngine: 'claude', pr: '42', worktree: '/tmp/wt', branch: 'fleet/backend/1', lane,
}

const passingReport = (): VerifyReport => ({
  passed: true, reasons: [], changedFiles: [], addedLines: 0,
  impact: 'low', impactReasons: [], testsPassed: true, verifiedCommit: 'deadbeef',
})

const failingReport = (): VerifyReport => ({
  passed: false, reasons: ['scope violation'], changedFiles: [], addedLines: 0,
  impact: 'low', impactReasons: [], testsPassed: true, verifiedCommit: undefined,
})

function deps(over: Partial<ReviewLoopDeps> = {}): ReviewLoopDeps {
  return {
    verifyMechanical: vi.fn(async () => passingReport()),
    prDiff: vi.fn(async () => 'diff'),
    secondOpinion: vi.fn(async (): Promise<SecondOpinionResult> => ({ verdict: 'PASS', text: 'VERDICT: PASS' })),
    postReview: vi.fn(async () => {}),
    reviseWithWorker: vi.fn(async () => {}),
    haltFleet: vi.fn(),
    log: () => {},
    ...over,
  }
}

describe('runReviewLoop', () => {
  it('a PASS on round one runs no second round', async () => {
    const d = deps()
    const result = await runReviewLoop(input, d)

    expect(result).toEqual({ finalVerdict: 'PASS', rounds: 1, needsHuman: false, lastReport: passingReport() })
    expect(d.verifyMechanical).toHaveBeenCalledTimes(1)
    expect(d.secondOpinion).toHaveBeenCalledTimes(1)
    expect(d.postReview).toHaveBeenCalledTimes(1)
    expect(d.postReview).toHaveBeenCalledWith('42', 'PASS', expect.any(String))
    expect(d.reviseWithWorker).not.toHaveBeenCalled()
  })

  it('a FAIL then a PASS reports two rounds', async () => {
    const secondOpinion = vi.fn<ReviewLoopDeps['secondOpinion']>()
      .mockResolvedValueOnce({ verdict: 'FAIL', text: 'VERDICT: FAIL — nope' })
      .mockResolvedValueOnce({ verdict: 'PASS', text: 'VERDICT: PASS' })
    const d = deps({ secondOpinion })

    const result = await runReviewLoop(input, d)

    expect(result.finalVerdict).toBe('PASS')
    expect(result.rounds).toBe(2)
    expect(result.needsHuman).toBe(false)
    expect(d.verifyMechanical).toHaveBeenCalledTimes(2) // re-verified on round two
    expect(secondOpinion).toHaveBeenCalledTimes(2)
    expect(d.reviseWithWorker).toHaveBeenCalledTimes(1)
    expect(d.reviseWithWorker).toHaveBeenCalledWith({ verdictText: 'VERDICT: FAIL — nope' })
  })

  it('two FAILs stop the loop and hand the item to a human', async () => {
    const secondOpinion = vi.fn<ReviewLoopDeps['secondOpinion']>()
      .mockResolvedValue({ verdict: 'FAIL', text: 'VERDICT: FAIL — still nope' })
    const d = deps({ secondOpinion })

    const result = await runReviewLoop(input, d)

    expect(result.finalVerdict).toBe('FAIL')
    expect(result.rounds).toBe(2)
    expect(result.needsHuman).toBe(true)
    // Revision is only useful ahead of a round that will actually happen —
    // there is no round 3, so revising after round 2's FAIL would be pure
    // waste. Exactly one revision, between rounds 1 and 2.
    expect(d.reviseWithWorker).toHaveBeenCalledTimes(1)
  })

  // The load-bearing mutation-guard test: a reviewer stubbed to ALWAYS FAIL
  // must never push the loop past MAX_REVIEW_ROUNDS. An off-by-one (`<=`
  // instead of `<` on the revise guard, or a loop bound one too high) would
  // still pass the "two FAILs" test above by coincidence if it happened to
  // stop at exactly two anyway; asserting the exact call counts here is
  // what catches a loop that would keep going a third, fourth, fifth round
  // against a reviewer that never changes its mind — burning a worker's
  // budget and the fleet's rate limit at the same time.
  it('the round counter cannot exceed two even with a reviewer stubbed to always FAIL', async () => {
    const secondOpinion = vi.fn<ReviewLoopDeps['secondOpinion']>()
      .mockResolvedValue({ verdict: 'FAIL', text: 'VERDICT: FAIL — always' })
    const d = deps({ secondOpinion })

    const result = await runReviewLoop(input, d)

    expect(result.rounds).toBe(MAX_REVIEW_ROUNDS)
    expect(result.rounds).toBeLessThanOrEqual(2)
    expect(secondOpinion).toHaveBeenCalledTimes(MAX_REVIEW_ROUNDS)
    expect(d.verifyMechanical).toHaveBeenCalledTimes(MAX_REVIEW_ROUNDS)
    expect(d.reviseWithWorker).toHaveBeenCalledTimes(MAX_REVIEW_ROUNDS - 1)
  })

  it('a mechanical failure ends the loop immediately, without ever requesting a review', async () => {
    const d = deps({ verifyMechanical: vi.fn(async () => failingReport()) })

    const result = await runReviewLoop(input, d)

    expect(result.finalVerdict).toBe('FAIL')
    expect(result.rounds).toBe(1)
    expect(result.needsHuman).toBe(true)
    expect(d.secondOpinion).not.toHaveBeenCalled()
    expect(d.reviseWithWorker).not.toHaveBeenCalled()
  })

  // Trust failure, not a review outcome: a verifier that tampers with the
  // author's own worktree must never be retried, and must trip the kill
  // switch fleet-wide rather than being treated as one more FAIL round.
  it('a verifier that tampers with the worktree trips the kill switch and is never retried', async () => {
    const secondOpinion = vi.fn(async () => {
      throw new VerifierTamperedWorktreeError('HEAD moved during review')
    })
    const haltFleet = vi.fn()
    const d = deps({ secondOpinion, haltFleet })

    const result = await runReviewLoop(input, d)

    expect(result.needsHuman).toBe(true)
    expect(result.rounds).toBe(1)
    expect(haltFleet).toHaveBeenCalledTimes(1)
    expect(haltFleet.mock.calls[0]?.[0]).toContain('42')
    // Not retried: exactly one attempt, no revision, no second mechanical
    // verify, and no review posted for a verdict that cannot be trusted.
    expect(secondOpinion).toHaveBeenCalledTimes(1)
    expect(d.reviseWithWorker).not.toHaveBeenCalled()
    expect(d.verifyMechanical).toHaveBeenCalledTimes(1)
    expect(d.postReview).not.toHaveBeenCalled()
  })

  it('propagates an ordinary (non-tamper) error from secondOpinion rather than swallowing it', async () => {
    const secondOpinion = vi.fn(async () => { throw new Error('network down') })
    const d = deps({ secondOpinion })

    await expect(runReviewLoop(input, d)).rejects.toThrow('network down')
    expect(d.haltFleet).not.toHaveBeenCalled()
  })
})
