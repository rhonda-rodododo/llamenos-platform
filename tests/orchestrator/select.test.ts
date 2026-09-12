import { describe, it, expect } from 'vitest'
import { judge, selectForLane } from '../../orchestrator/src/select.js'
import type { Lane } from '../../orchestrator/src/config.js'
import type { WorkItem } from '../../orchestrator/src/source.js'

const lane: Lane = {
  id: 'ios', mode: 'live', cap: 1, engine: 'claude',
  requireLabel: 'agent-dispatchable',
  vetoLabels: ['needs-human', 'blocked'],
  scope: { owned: ['apps/ios/'], notOwned: [] },
}
const item = (o: Partial<WorkItem> = {}): WorkItem =>
  ({ id: '1', title: 't', body: 'x'.repeat(300), url: 'u', labels: [], ...o })

describe('judge', () => {
  it('accepts a well-formed dispatchable item for its lane', () => {
    expect(judge(item(), ['agent-dispatchable', 'lane:ios'], lane).ok).toBe(true)
  })

  it('rejects an item missing the require label', () => {
    const r = judge(item(), ['lane:ios'], lane)
    expect(r).toEqual({ ok: false, reason: 'missing-require-label' })
  })

  it('rejects an item carrying a veto label even alongside the require label', () => {
    const r = judge(item(), ['agent-dispatchable', 'lane:ios', 'needs-human'], lane)
    expect(r).toEqual({ ok: false, reason: 'vetoed' })
  })

  it('rejects an item labelled for another lane', () => {
    const r = judge(item(), ['agent-dispatchable', 'lane:android'], lane)
    expect(r).toEqual({ ok: false, reason: 'other-lane' })
  })

  it('rejects an under-specified body', () => {
    const r = judge(item({ body: 'too short' }), ['agent-dispatchable', 'lane:ios'], lane)
    expect(r).toEqual({ ok: false, reason: 'body-too-short' })
  })

  it('treats unreadable labels as not dispatchable', () => {
    const r = judge(item(), undefined, lane)
    expect(r).toEqual({ ok: false, reason: 'labels-unreadable' })
  })

  it('checks the veto before the lane match, so a vetoed item never looks routable', () => {
    const r = judge(item(), ['agent-dispatchable', 'lane:android', 'blocked'], lane)
    expect(r).toEqual({ ok: false, reason: 'vetoed' })
  })
})

describe('selectForLane', () => {
  it('returns candidates and rejections together', () => {
    const items = [item({ id: '1', labels: [] }), item({ id: '2' })]
    const labels = new Map([['1', ['agent-dispatchable', 'lane:ios']], ['2', ['lane:ios']]])
    const r = selectForLane(items, labels, lane)
    expect(r.candidates.map((c) => c.id)).toEqual(['1'])
    expect(r.rejections).toEqual([{ id: '2', reason: 'missing-require-label' }])
  })

  it('preserves input order so board priority is honoured', () => {
    const items = [item({ id: '9' }), item({ id: '3' })]
    const labels = new Map([['9', ['agent-dispatchable', 'lane:ios']], ['3', ['agent-dispatchable', 'lane:ios']]])
    expect(selectForLane(items, labels, lane).candidates.map((c) => c.id)).toEqual(['9', '3'])
  })

  // The map's real caller is source.ts's labels(id), which can genuinely
  // resolve an entry to `undefined` (labels unreadable for that specific
  // item) alongside entries present with real label arrays — this is
  // distinct from an id simply missing from the map (also undefined via
  // Map.get, but never actually produced by the real call site, since every
  // dispatch-loop item gets exactly one labels() lookup). Both a present-
  // but-undefined entry and a genuinely absent key must reject the same way.
  it('rejects an item whose labels entry is explicitly undefined (unreadable at dispatch time)', () => {
    const items = [item({ id: '1' }), item({ id: '2' }), item({ id: '3' })]
    const labels = new Map<string, string[] | undefined>([
      ['1', ['agent-dispatchable', 'lane:ios']],
      ['2', undefined],
      // '3' intentionally absent from the map entirely
    ])
    const r = selectForLane(items, labels, lane)
    expect(r.candidates.map((c) => c.id)).toEqual(['1'])
    expect(r.rejections).toEqual([
      { id: '2', reason: 'labels-unreadable' },
      { id: '3', reason: 'labels-unreadable' },
    ])
  })
})
