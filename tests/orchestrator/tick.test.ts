import { describe, it, expect, vi } from 'vitest'
import { tick, claimAcrossLanes, type TickDeps } from '../../orchestrator/src/tick.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'

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
    dispatch: vi.fn(async () => ({ outcome: 'SUCCESS' as const })),
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
