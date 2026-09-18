import { describe, it, expect } from 'vitest'
import { parseLedger, failedAttemptsIn, sinceIn, type RunRecord } from '../../orchestrator/src/ledger.js'

const rec = (o: Partial<RunRecord>): RunRecord => ({
  ts: 0, runId: 'r', lane: 'backend', itemId: '1', itemName: 'n',
  engine: 'claude', outcome: 'SUCCESS', ...o,
})

describe('ledger', () => {
  it('survives a truncated final line', () => {
    const good = JSON.stringify(rec({ runId: 'a' }))
    const parsed = parseLedger(good + '\n' + '{"ts":123,"runI')
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.runId).toBe('a')
  })

  it('counts failed attempts back to the most recent success', () => {
    const rows = [
      rec({ itemId: '7', outcome: 'FAILED', ts: 1 }),
      rec({ itemId: '7', outcome: 'SUCCESS', ts: 2 }),
      rec({ itemId: '7', outcome: 'FAILED', ts: 3 }),
      rec({ itemId: '7', outcome: 'FAILED', ts: 4 }),
    ]
    expect(failedAttemptsIn(rows, '7')).toBe(2)
  })

  it('does not count QUOTA as a failed attempt', () => {
    const rows = [rec({ itemId: '7', outcome: 'QUOTA', ts: 1 }), rec({ itemId: '7', outcome: 'FAILED', ts: 2 })]
    expect(failedAttemptsIn(rows, '7')).toBe(1)
  })

  it('ignores DISPATCHED rows when counting attempts', () => {
    const rows = [rec({ itemId: '7', outcome: 'DISPATCHED', ts: 1 }), rec({ itemId: '7', outcome: 'FAILED', ts: 2 })]
    expect(failedAttemptsIn(rows, '7')).toBe(1)
  })

  it('selects rows inside a window relative to an injected now', () => {
    const rows = [rec({ ts: 1000 }), rec({ ts: 5000 })]
    expect(sinceIn(rows, 2000, 6000)).toHaveLength(1)
  })
})
