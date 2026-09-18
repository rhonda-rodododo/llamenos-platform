import { describe, it, expect } from 'vitest'
import { toWorkItem, itemsFrom } from '../../orchestrator/src/source.js'

const RAW = {
  number: 42,
  title: 'Fix the thing',
  body: 'x'.repeat(300),
  url: 'https://github.com/o/r/issues/42',
  state: 'OPEN',
  labels: [{ name: 'agent-dispatchable' }, { name: 'lane:ios' }],
}

describe('source', () => {
  it('maps a gh issue onto a WorkItem', () => {
    const item = toWorkItem(RAW)
    expect(item.id).toBe('42')
    expect(item.title).toBe('Fix the thing')
    expect(item.labels).toEqual(['agent-dispatchable', 'lane:ios'])
    expect(item.url).toBe('https://github.com/o/r/issues/42')
  })

  it('tolerates a null body', () => {
    expect(toWorkItem({ ...RAW, body: null }).body).toBe('')
  })

  it('returns undefined — not [] — when the read failed', () => {
    expect(itemsFrom(undefined)).toBeUndefined()
  })

  it('returns an empty array for a genuinely empty backlog', () => {
    expect(itemsFrom([])).toEqual([])
  })
})
