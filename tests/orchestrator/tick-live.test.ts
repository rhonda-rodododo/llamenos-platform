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
    enableAutoMerge: vi.fn(async () => {}),
    disableAutoMerge: vi.fn(async () => {}),
    commentOnIssue: vi.fn(async () => {}),
    commentOnPr: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    record: vi.fn(),
    log: () => {},
    ...over,
  }
}

describe('tick: live dispatch pipeline (task 7)', () => {
  it('a live lane dispatches, arms GitHub auto-merge, verifies, and gets a second opinion', async () => {
    const d = baseDeps()
    const r = await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
    expect(d.enableAutoMerge).toHaveBeenCalledWith('42')
    expect(d.verifyMechanical).toHaveBeenCalledWith({ worktree: '/wt/ios-1', branch: 'fleet/ios/1', lane: lane() })
    expect(d.secondOpinion).toHaveBeenCalledTimes(1)
    expect(d.postReview).toHaveBeenCalledWith('42', 'PASS', expect.any(String))
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS', pr: '42', branch: 'fleet/ios/1' }))
    expect(r.attempted).toBe(1)
  })

  // THE ordering property, and the one the non-author reviewer caught this
  // PR getting backwards. Arming at PR-open left a window in which a PR the
  // fleet went on to REJECT — its own reviewer returning VERDICT: FAIL —
  // stayed armed and would merge the moment ordinary CI went green. Nothing
  // disarmed it. Auto-merge is now armed only after BOTH gates passed.
  it('arms auto-merge only after verify and review have passed, never before', async () => {
    const order: string[] = []
    const d = baseDeps({
      enableAutoMerge: vi.fn(async () => { order.push('auto-merge') }),
      verifyMechanical: vi.fn(async () => { order.push('verify'); return passingVerify }),
      secondOpinion: vi.fn(async () => { order.push('review'); return { verdict: 'PASS' as const, text: 'VERDICT: PASS' } }),
    })
    await tick(d)
    expect(order).toEqual(['verify', 'review', 'auto-merge'])
  })

  it.each([
    ['a mechanical failure', { verifyMechanical: () => ({ ...passingVerify, passed: false, reasons: ['nope'] }) }],
    ['a failing review', { secondOpinion: () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL' }) }],
  ])('never arms auto-merge after %s, and disarms anything an earlier attempt armed', async (_label, over) => {
    const d = baseDeps(Object.fromEntries(
      Object.entries(over).map(([k, fn]) => [k, vi.fn(async () => (fn as () => unknown)())]),
    ) as Partial<TickDeps>)
    await tick(d)
    expect(d.enableAutoMerge).not.toHaveBeenCalled()
    expect(d.disableAutoMerge).toHaveBeenCalledWith('42')
  })

  it('does not disarm on the success path — that would undo what it just armed', async () => {
    const d = baseDeps()
    await tick(d)
    expect(d.enableAutoMerge).toHaveBeenCalledWith('42')
    expect(d.disableAutoMerge).not.toHaveBeenCalled()
  })

  it('a failure to arm auto-merge is logged and does not fail the item — nothing merges, which is the safe direction', async () => {
    const lines: string[] = []
    const d = baseDeps({
      enableAutoMerge: vi.fn(async () => { throw new Error('gh: auto-merge is not enabled for this repository') }),
      log: (msg: string) => { lines.push(msg) },
    })
    const r = await tick(d)
    expect(r.failed).toBe(0)
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS' }))
    expect(lines.some((l) => l.includes('could not arm'))).toBe(true)
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
    // verify/review must never have been reached for a QUOTA outcome
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

  it('a review verdict that is not PASS is REJECTED', async () => {
    const d = baseDeps({ secondOpinion: vi.fn(async () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL — nope' })) })
    await tick(d)
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'REJECTED' }))
  })
})

describe('tick: G1 needs-human handoff and G2 gate-trace observability', () => {
  it('a verified, reviewed, auto-merge-armed SUCCESS does NOT get needs-human — GitHub holds it, not a label', async () => {
    const d = baseDeps()
    await tick(d)
    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS', needsHuman: false }))
  })

  it('an ordinary mechanical REJECTED does NOT get needs-human — it is still retryable', async () => {
    const failing: VerifyReport = { ...passingVerify, passed: false, reasons: ['touched never-write paths: .env'] }
    const d = baseDeps({ verifyMechanical: vi.fn(async () => failing) })
    await tick(d)
    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'REJECTED', needsHuman: false }))
  })

  it('a review-exhausted REJECTED does NOT get needs-human — it is still retryable', async () => {
    const d = baseDeps({ secondOpinion: vi.fn(async () => ({ verdict: 'FAIL' as const, text: 'VERDICT: FAIL — nope' })) })
    await tick(d)
    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'REJECTED', needsHuman: false }))
  })

  it('logs one line per gate stage reached: verify and review', async () => {
    const lines: string[] = []
    const d = baseDeps({ log: (msg: string) => { lines.push(msg) } })
    await tick(d)
    expect(lines.some((l) => l.startsWith('verify:'))).toBe(true)
    expect(lines.some((l) => l.startsWith('review:'))).toBe(true)
  })

  it('a mechanical failure logs a verify line but no review line — the operator can tell the gate never reached review', async () => {
    const lines: string[] = []
    const failing: VerifyReport = { ...passingVerify, passed: false, reasons: ['touched never-write paths: .env'] }
    const d = baseDeps({ verifyMechanical: vi.fn(async () => failing), log: (msg: string) => { lines.push(msg) } })
    await tick(d)
    expect(lines.some((l) => l.startsWith('verify:'))).toBe(true)
    expect(lines.some((l) => l.startsWith('review:'))).toBe(false)
  })

  it('the terminal note is a compact gate trace carrying scope, impact, tests, review and sha', async () => {
    const d = baseDeps()
    await tick(d)
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'SUCCESS',
      note: expect.stringMatching(/scope=\S+ impact=\S+ tests=\S+ review=PASS sha=c0ffee/),
    }))
  })

  // G3: the root-caused fix for issue #660/PR #662 — a worker-reported
  // SUCCESS whose dispatch result is missing branch/worktree must NEVER be
  // silently treated as a real, verified merge. The whole pipeline is
  // skipped, so it must be flagged for a human and the PR told it received
  // no automated verification.
  describe('G3: a claimed SUCCESS the fleet cannot verify (issue #660/PR #662)', () => {
    it('is recorded as-is, flagged needs-human, and comments on the PR that no verification ran', async () => {
      const dispatch = vi.fn(async (): Promise<DispatchOutcome> =>
        ({ outcome: 'SUCCESS', pr: '662', note: 'dep:abc123 worker summary here' })) // no branch, no worktree
      const d = baseDeps({ dispatch })
      await tick(d)

      expect(d.verifyMechanical).not.toHaveBeenCalled()
      expect(d.secondOpinion).not.toHaveBeenCalled()
      expect(d.commentOnPr).toHaveBeenCalledWith('662', expect.stringContaining('NO automated verification'))
      expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS', needsHuman: true }))
      expect(d.record).toHaveBeenCalledWith(expect.objectContaining({
        outcome: 'SUCCESS',
        note: expect.stringContaining('scope=not-run'),
      }))
    })

    it('still carries the worker\'s own note alongside the not-run trace', async () => {
      const dispatch = vi.fn(async (): Promise<DispatchOutcome> =>
        ({ outcome: 'SUCCESS', pr: '662', note: 'dep:abc123 worker summary here' }))
      const d = baseDeps({ dispatch })
      await tick(d)
      expect(d.record).toHaveBeenCalledWith(expect.objectContaining({
        note: expect.stringContaining('dep:abc123 worker summary here'),
      }))
    })

    it('does not comment on a PR that does not exist (no pr field at all)', async () => {
      const dispatch = vi.fn(async (): Promise<DispatchOutcome> => ({ outcome: 'SUCCESS', note: 'no pr yet' }))
      const d = baseDeps({ dispatch })
      await tick(d)
      expect(d.commentOnPr).not.toHaveBeenCalled()
      expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS', needsHuman: true }))
    })
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
