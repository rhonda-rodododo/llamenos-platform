import { describe, it, expect, vi } from 'vitest'
import { tick, claimAcrossLanes, type TickDeps } from '../../orchestrator/src/tick.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'
import type { RunRecord } from '../../orchestrator/src/ledger.js'

const lane = (id: string, mode: Lane['mode'] = 'shadow'): Lane => ({
  id, mode, cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable',
  vetoLabels: ['needs-human'],
  scope: { owned: [`apps/${id}/`], notOwned: [] },
})
const item = (id: string): WorkItem =>
  ({ id, title: `t${id}`, body: 'x'.repeat(300), url: 'u', labels: [] })

function deps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    lanes: [lane('ios')],
    now: () => 1000,
    acquireLock: () => ({ held: true, release: () => {} }),
    checkHalt: async () => ({ halted: false }),
    readLedger: () => [],
    resumedAt: () => 0,
    listItems: async () => [item('1')],
    readLabels: async () => ['agent-dispatchable', 'lane:ios'],
    // Default dispatch resolves SUCCESS but WITHOUT pr/branch/worktree, so it
    // never falls into the verify/review/merge pipeline unless a test opts
    // in explicitly by overriding dispatch (or the pipeline deps below).
    dispatch: vi.fn(async () => ({ outcome: 'SUCCESS' as const })),
    verifyMechanical: vi.fn(async () => ({
      passed: true, reasons: [], changedFiles: [], addedLines: 0,
      impact: 'low' as const, impactReasons: [], testsPassed: true, verifiedCommit: 'deadbeef',
    })),
    prDiff: vi.fn(async () => ''),
    secondOpinion: vi.fn(async () => ({ verdict: 'PASS' as const, text: 'VERDICT: PASS' })),
    postReview: vi.fn(async () => {}),
    reviseWithWorker: vi.fn(async () => {}),
    haltFleet: vi.fn(),
    ciStatusFor: vi.fn(async () => true),
    prHeadSha: vi.fn(async () => 'deadbeef'),
    mergePr: vi.fn(async () => {}),
    commentOnIssue: vi.fn(async () => {}),
    settle: vi.fn(async () => {}),
    record: vi.fn(),
    log: () => {},
    ...over,
  }
}

describe('tick', () => {
  it('does nothing when another scheduler holds the lock', async () => {
    const d = deps({ acquireLock: () => ({ held: false, heldByPid: 5 }) })
    const r = await tick(d)
    expect(r.ran).toBe(false)
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('never rejects when acquireLock() throws (unwritable $HOME, full disk, read-only remount)', async () => {
    const d = deps({
      acquireLock: () => {
        throw new Error('cannot acquire lock at /home/x/.llamenos-fleet/lock: EACCES')
      },
    })
    const r = await tick(d)
    expect(r.aborted).toBe('error')
    expect(r.errorMessage).toContain('EACCES')
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('does nothing when halted', async () => {
    const d = deps({ checkHalt: async () => ({ halted: true, reason: 'testing' }) })
    const r = await tick(d)
    expect(r.halted).toBe(true)
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('aborts the whole pass when the source is unreadable', async () => {
    const d = deps({ listItems: async () => undefined })
    const r = await tick(d)
    expect(r.aborted).toBe('source-unreadable')
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  it('does not dispatch in shadow mode but does record a SHADOW row', async () => {
    const d = deps()
    await tick(d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SHADOW', lane: 'ios' }))
  })

  it('dispatches in live mode', async () => {
    const d = deps({ lanes: [lane('ios', 'live')] })
    await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
  })

  it('skips a lane whose mode is off', async () => {
    const d = deps({ lanes: [lane('ios', 'off')] })
    await tick(d)
    expect(d.record).not.toHaveBeenCalled()
  })

  it('re-checks halt between dispatches and stops mid-pass', async () => {
    let calls = 0
    const d = deps({
      lanes: [lane('ios', 'live')],
      listItems: async () => [item('1'), item('2')],
      checkHalt: async () => { calls++; return { halted: calls > 2 } },
    })
    const d2 = { ...d, lanes: [{ ...lane('ios', 'live'), cap: 5 }] }
    await tick(d2)
    expect((d.dispatch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(2)
  })

  it('honours the per-lane cap', async () => {
    const d = deps({
      lanes: [{ ...lane('ios', 'live'), cap: 1 }],
      listItems: async () => [item('1'), item('2'), item('3')],
    })
    await tick(d)
    expect(d.dispatch).toHaveBeenCalledTimes(1)
  })

  it('records rejections so the digest can explain a quiet pass', async () => {
    const d = deps({ readLabels: async () => ['lane:ios'] })
    const r = await tick(d)
    expect(r.rejections).toEqual([{ id: '1', reason: 'missing-require-label' }])
  })

  // E1: a rejecting dispatch() must not crash the process or abort the pass —
  // it is recorded FAILED (note truncated to ~300 chars) and the loop moves on
  // to the next item, so the consecutive-failure breaker (not an uncaught
  // rejection) is what eventually stops a run of these. This also proves E5's
  // first half: the lock is still released.
  it('records a FAILED row (truncated) and continues past a rejecting dispatch, without losing the lock', async () => {
    const release = vi.fn()
    const longMessage = 'x'.repeat(400)
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error(longMessage))
      .mockResolvedValueOnce({ outcome: 'SUCCESS' as const })
    const d = deps({
      lanes: [{ ...lane('ios', 'live'), cap: 2 }],
      listItems: async () => [item('1'), item('2')],
      acquireLock: () => ({ held: true, release }),
      dispatch,
    })
    const r = await tick(d)
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: '1', outcome: 'FAILED', note: 'x'.repeat(300) }),
    )
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ itemId: '2', outcome: 'SUCCESS' }))
    expect(r.attempted).toBe(2)
    expect(r.failed).toBe(1)
    expect(r.aborted).toBeUndefined()
    expect(release).toHaveBeenCalledTimes(1)
  })

  // E1 (layer 2) + E5 (second half): a rejection from anywhere else in the
  // pass — here, listItems() itself throwing instead of resolving to
  // `undefined` — must not escape tick() uncaught either. It comes back as
  // `aborted: 'error'`, and the lock is still released.
  it('returns aborted: "error" and releases the lock, rather than throwing, when listItems rejects unexpectedly', async () => {
    const release = vi.fn()
    const d = deps({
      acquireLock: () => ({ held: true, release }),
      listItems: async () => { throw new Error('network down') },
    })
    const r = await tick(d)
    expect(r.aborted).toBe('error')
    expect(r.errorMessage).toContain('network down')
    expect(release).toHaveBeenCalledTimes(1)
    expect(d.dispatch).not.toHaveBeenCalled()
  })

  // E2: `judge()` legitimately lets one item pass for two lanes at once (it is
  // labelled for both). Ownership must still be exclusive at dispatch time —
  // the first lane in claim-priority order gets it, the second must not also
  // dispatch it.
  it('claims a dual-labelled item to only the first lane in claim-priority order', async () => {
    const dispatch = vi.fn(async (_item: WorkItem, _lane: Lane) => ({ outcome: 'SUCCESS' as const }))
    const d = deps({
      lanes: [lane('backend', 'live'), lane('ios', 'live')],
      readLabels: async () => ['agent-dispatchable', 'lane:backend', 'lane:ios'],
      dispatch,
    })
    const r = await tick(d)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][1].id).toBe('backend')
    expect(r.attempted).toBe(1)
  })

  // E3: MAX_ATTEMPTS_PER_ITEM is enforced by failedAttemptsIn() at dispatch
  // time, not merely defined as a constant. resumedAt is set past all three
  // failure rows on purpose — the consecutive-failure breaker only counts rows
  // after resumedAt, so without this the breaker would trip first (aborted:
  // 'breaker') and mask whether the per-item skip itself works.
  it('skips an item that has exhausted MAX_ATTEMPTS_PER_ITEM prior failures', async () => {
    const rows: RunRecord[] = [
      { ts: 1, runId: 'a', lane: 'ios', itemId: '1', itemName: 't1', engine: 'claude', outcome: 'FAILED' },
      { ts: 2, runId: 'b', lane: 'ios', itemId: '1', itemName: 't1', engine: 'claude', outcome: 'FAILED' },
      { ts: 3, runId: 'c', lane: 'ios', itemId: '1', itemName: 't1', engine: 'claude', outcome: 'FAILED' },
    ]
    const d = deps({
      lanes: [lane('ios', 'live')],
      readLedger: () => rows,
      resumedAt: () => 10, // past all three failure rows — see comment above
    })
    const r = await tick(d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(r.attempted).toBe(0)
  })

  // E4: cap must be tracked per lane. The mutation this guards against is
  // hoisting `let taken = 0` out of the per-lane loop so it accumulates across
  // lanes — that would starve every lane after the first.
  it('applies the per-lane cap independently, so a second lane is not starved by the first', async () => {
    const dispatch = vi.fn(async () => ({ outcome: 'SUCCESS' as const }))
    const backendItems = [item('b1'), item('b2')]
    const iosItems = [item('i1'), item('i2')]
    const d = deps({
      lanes: [{ ...lane('backend', 'live'), cap: 1 }, { ...lane('ios', 'live'), cap: 1 }],
      listItems: async (l: Lane) => (l.id === 'backend' ? backendItems : iosItems),
      readLabels: async (id: string) =>
        id.startsWith('b') ? ['agent-dispatchable', 'lane:backend'] : ['agent-dispatchable', 'lane:ios'],
      dispatch,
    })
    const r = await tick(d)
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(r.attempted).toBe(2)
  })
})

describe('claimAcrossLanes', () => {
  it('gives an item to the first lane in order that can claim it', () => {
    const owned = claimAcrossLanes(
      [lane('backend'), lane('ios')],
      new Map([['backend', [item('1')]], ['ios', [item('1')]]]),
    )
    expect(owned.get('1')).toBe('backend')
  })

  it('never assigns one item to two lanes', () => {
    const owned = claimAcrossLanes(
      [lane('backend'), lane('ios')],
      new Map([['backend', [item('1')]], ['ios', [item('1'), item('2')]]]),
    )
    expect([...owned.entries()].sort()).toEqual([['1', 'backend'], ['2', 'ios']])
  })
})
