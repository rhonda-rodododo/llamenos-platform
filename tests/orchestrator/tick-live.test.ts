import { describe, it, expect, vi } from 'vitest'
import { tick, type TickDeps, type DispatchOutcome } from '../../orchestrator/src/tick.js'
import { failureBreaker, type Limits } from '../../orchestrator/src/circuit.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'
import type { RunRecord } from '../../orchestrator/src/ledger.js'
import type { VerifyReport } from '../../orchestrator/src/verify.js'

const LIMITS: Limits = { maxDispatchesPerHour: 8, consecutiveFailuresToHalt: 3, quotaCooldownMs: 3_600_000 }

const lane = (mode: Lane['mode'] = 'live'): Lane => ({
  id: 'ios', mode, cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable',
  vetoLabels: ['needs-human'],
  scope: { owned: ['apps/ios/'], notOwned: [] },
})
const item = (id = '1'): WorkItem =>
  ({ id, title: `t${id}`, body: 'x'.repeat(300), url: 'u', labels: [] })

const passingVerify: VerifyReport = {
  passed: true, reasons: [], changedFiles: ['apps/ios/a.swift'], addedLines: 3,
  impact: 'low', impactReasons: [], testsRun: ['orchestrator'], testsPassed: true, verifiedCommit: 'c0ffee',
}

function baseDeps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    lanes: [lane()],
    now: () => 1000,
    acquireLock: () => ({ held: true, release: () => {} }),
    checkHalt: async () => ({ halted: false }),
    readLedger: () => [],
    resumedAt: () => 0,
    listItems: async () => [item()],
    readLabels: async () => ['agent-dispatchable', 'lane:ios'],
    dispatch: vi.fn(async (): Promise<DispatchOutcome> =>
      ({ outcome: 'SUCCESS', branch: 'fleet/ios/1', pr: '42', worktree: '/wt/ios-1' })),
    verifyMechanical: vi.fn(async () => passingVerify),
    prDiff: vi.fn(async () => 'diff --git a/x b/x'),
    secondOpinion: vi.fn(async () => ({ verdict: 'PASS' as const, text: 'VERDICT: PASS' })),
    postReview: vi.fn(async () => {}),
    reviseWithWorker: vi.fn(async () => {}),
    haltFleet: vi.fn(),
    ciStatusFor: vi.fn(async () => true),
    prHeadSha: vi.fn(async () => 'c0ffee'),
    mergePr: vi.fn(async () => {}),
    commentOnIssue: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    record: vi.fn(),
    log: () => {},
    ...over,
  }
}

describe('tick: live dispatch pipeline (task 7)', () => {
  it('a live lane dispatches, verifies, gets a second opinion, and merges on a clean pass', async () => {
    const d = baseDeps()
    const r = await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
    expect(d.verifyMechanical).toHaveBeenCalledWith({ worktree: '/wt/ios-1', branch: 'fleet/ios/1', lane: lane() })
    expect(d.secondOpinion).toHaveBeenCalledTimes(1)
    expect(d.postReview).toHaveBeenCalledWith('42', 'PASS', expect.any(String))
    expect(d.mergePr).toHaveBeenCalledWith('42', 'c0ffee')
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS', pr: '42', branch: 'fleet/ios/1' }))
    expect(r.attempted).toBe(1)
  })

  it('writes a DISPATCHED row BEFORE the worker runs — this is what the rate breaker counts (#638)', async () => {
    const order: string[] = []
    const record = vi.fn((r: RunRecord) => { order.push(`record:${r.outcome}`) })
    const dispatch = vi.fn(async (): Promise<DispatchOutcome> => {
      order.push('dispatch:called')
      return { outcome: 'SUCCESS', branch: 'fleet/ios/1', pr: '42', worktree: '/wt/ios-1' }
    })
    const d = baseDeps({ record, dispatch })
    await tick(d)
    const dispatchedIdx = order.indexOf('record:DISPATCHED')
    const dispatchCallIdx = order.indexOf('dispatch:called')
    expect(dispatchedIdx).toBeGreaterThanOrEqual(0)
    expect(dispatchCallIdx).toBeGreaterThan(dispatchedIdx)
  })

  it('honours inQuotaCooldown and skips the lane without dispatching', async () => {
    const rows: RunRecord[] = [
      { ts: 900, runId: 'a', lane: 'ios', itemId: '9', itemName: 't9', engine: 'claude', outcome: 'QUOTA' },
    ]
    const d = baseDeps({ readLedger: () => rows, now: () => 1000 })
    const r = await tick(d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(r.attempted).toBe(0)
  })

  it('does dispatch again once the quota cooldown window has elapsed', async () => {
    const rows: RunRecord[] = [
      { ts: 900, runId: 'a', lane: 'ios', itemId: '9', itemName: 't9', engine: 'claude', outcome: 'QUOTA' },
    ]
    const d = baseDeps({ readLedger: () => rows, now: () => 900 + LIMITS.quotaCooldownMs + 1 })
    await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
  })

  it('a QUOTA outcome from dispatch() is recorded as QUOTA and does not feed the consecutive-failure streak', async () => {
    const recorded: RunRecord[] = []
    const record = vi.fn((r: RunRecord) => recorded.push(r))
    const dispatch = vi.fn(async (): Promise<DispatchOutcome> => ({ outcome: 'QUOTA', note: 'provider rate limit' }))
    const d = baseDeps({ record, dispatch })
    await tick(d)
    expect(recorded.some((r) => r.outcome === 'QUOTA')).toBe(true)
    // verify/review/merge must never have been reached for a QUOTA outcome
    expect(d.verifyMechanical).not.toHaveBeenCalled()
    expect(failureBreaker(recorded, LIMITS, 0)).toBeUndefined()
  })

  it('records exactly one terminal row per run (plus the non-terminal DISPATCHED row)', async () => {
    const recorded: RunRecord[] = []
    const d = baseDeps({ record: vi.fn((r: RunRecord) => recorded.push(r)) })
    await tick(d)
    const terminal = recorded.filter((r) => r.outcome !== 'DISPATCHED')
    expect(terminal.length).toBe(1)
    expect(recorded.filter((r) => r.outcome === 'DISPATCHED').length).toBe(1)
  })

  it('records exactly one terminal row even when mechanical verification fails', async () => {
    const recorded: RunRecord[] = []
    const failing: VerifyReport = { ...passingVerify, passed: false, reasons: ['touched a forbidden path'] }
    const d = baseDeps({ record: vi.fn((r: RunRecord) => recorded.push(r)), verifyMechanical: vi.fn(async () => failing) })
    await tick(d)
    const terminal = recorded.filter((r) => r.outcome !== 'DISPATCHED')
    expect(terminal).toHaveLength(1)
    expect(terminal[0]?.outcome).toBe('REJECTED')
    expect(d.secondOpinion).not.toHaveBeenCalled() // never rescue a mechanical failure
    expect(d.commentOnIssue).toHaveBeenCalled()
  })

  it('the settle path destroys the worktree on success', async () => {
    const d = baseDeps()
    await tick(d)
    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ worktree: '/wt/ios-1', outcome: 'SUCCESS' }))
  })

  it('the settle path destroys the worktree when mechanical verification fails', async () => {
    const failing: VerifyReport = { ...passingVerify, passed: false, reasons: ['nope'] }
    const d = baseDeps({ verifyMechanical: vi.fn(async () => failing) })
    await tick(d)
    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ worktree: '/wt/ios-1', outcome: 'REJECTED' }))
  })

  it('the settle path destroys the worktree even when a step throws', async () => {
    const d = baseDeps({ verifyMechanical: vi.fn(async () => { throw new Error('worktree vanished') }) })
    const r = await tick(d)
    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ worktree: '/wt/ios-1', outcome: 'FAILED' }))
    expect(r.failed).toBe(1)
    // tick itself must never throw or abort the whole pass over one item's exception
    expect(r.aborted).toBeUndefined()
  })

  it('settle() throwing is swallowed — it must not abort the pass or hide the already-recorded outcome', async () => {
    const recorded: RunRecord[] = []
    const d = baseDeps({
      record: vi.fn((r: RunRecord) => recorded.push(r)),
      settle: vi.fn(async () => { throw new Error('tmux not installed') }),
    })
    const r = await tick(d)
    expect(r.aborted).toBeUndefined()
    expect(recorded.some((row) => row.outcome === 'SUCCESS')).toBe(true)
  })

  it('a review verdict that is not PASS is REJECTED and never merged', async () => {
    const d = baseDeps({ secondOpinion: vi.fn(async () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL — nope' })) })
    await tick(d)
    expect(d.mergePr).not.toHaveBeenCalled()
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'REJECTED' }))
  })

  it('a passing review that mayAutoMerge still refuses (e.g. CI red) is BLOCKED for a human, not REJECTED', async () => {
    const d = baseDeps({ ciStatusFor: vi.fn(async () => false) })
    await tick(d)
    expect(d.mergePr).not.toHaveBeenCalled()
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'BLOCKED' }))
    expect(d.commentOnIssue).toHaveBeenCalled()
  })

  it('refuses to merge when the PR head moved since verification, even with everything else green', async () => {
    const d = baseDeps({ prHeadSha: vi.fn(async () => 'a-different-commit') })
    await tick(d)
    expect(d.mergePr).not.toHaveBeenCalled()
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'BLOCKED' }))
  })
})

describe('tick: labels re-read at dispatch time (task 9, issue #639)', () => {
  it('re-reads labels immediately before dispatch and skips an item that gained a veto label since selection', async () => {
    let calls = 0
    const readLabels = vi.fn(async () => {
      calls++
      // First read (selection phase) is clean; second read (immediately
      // before dispatch) reflects a human adding needs-human mid-pass.
      return calls === 1 ? ['agent-dispatchable', 'lane:ios'] : ['agent-dispatchable', 'lane:ios', 'needs-human']
    })
    const d = baseDeps({ readLabels })
    const r = await tick(d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(r.rejections).toContainEqual({ id: '1', reason: 'vetoed' })
  })

  it('skips dispatch (rather than dispatching on stale data) when labels are unreadable at dispatch time', async () => {
    let calls = 0
    const readLabels = vi.fn(async () => {
      calls++
      return calls === 1 ? ['agent-dispatchable', 'lane:ios'] : undefined
    })
    const d = baseDeps({ readLabels })
    const r = await tick(d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(r.rejections).toContainEqual({ id: '1', reason: 'labels-unreadable' })
  })

  it('still dispatches on the happy path where labels are unchanged at dispatch time', async () => {
    const d = baseDeps()
    await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
  })
})
