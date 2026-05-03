import { describe, it, expect } from 'bun:test'
import {
  encodeCursor,
  decodeCursor,
  fetchPage,
  countByPrefix,
  collectByPrefix,
} from '@worker/lib/pagination'

// ---------------------------------------------------------------------------
// encodeCursor / decodeCursor
// ---------------------------------------------------------------------------

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a simple key', () => {
    const key = 'note:abc123'
    expect(decodeCursor(encodeCursor(key))).toBe(key)
  })

  it('round-trips a key containing special base64 chars (+, /)', () => {
    // Force chars that become + and / in standard base64
    const key = 'key\xfb\xef'
    expect(decodeCursor(encodeCursor(key))).toBe(key)
  })

  it('produces URL-safe output (no +, /, or = chars)', () => {
    const encoded = encodeCursor('some:storage:key:0000001')
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('handles empty string', () => {
    expect(decodeCursor(encodeCursor(''))).toBe('')
  })

  it('handles keys with colons and slashes', () => {
    const key = 'records/hub-1/case-2/field:value'
    expect(decodeCursor(encodeCursor(key))).toBe(key)
  })
})

// ---------------------------------------------------------------------------
// fetchPage
// ---------------------------------------------------------------------------

type FakeStorage = {
  list<V = unknown>(opts?: { prefix?: string; limit?: number; startAfter?: string; reverse?: boolean }): Promise<Map<string, V>>
}

function makeFakeStorage(entries: [string, unknown][]): FakeStorage {
  return {
    async list<V = unknown>(opts?: { prefix?: string; limit?: number; startAfter?: string; reverse?: boolean }): Promise<Map<string, V>> {
      let filtered = entries
        .filter(([k]) => !opts?.prefix || k.startsWith(opts.prefix))

      if (opts?.startAfter) {
        filtered = filtered.filter(([k]) => k > opts.startAfter!)
      }

      if (opts?.reverse) {
        filtered = filtered.reverse()
      }

      if (opts?.limit !== undefined) {
        filtered = filtered.slice(0, opts.limit)
      }

      return new Map(filtered) as Map<string, V>
    },
  }
}

describe('fetchPage', () => {
  it('returns first page of items', async () => {
    const storage = makeFakeStorage([
      ['item:001', { id: '1' }],
      ['item:002', { id: '2' }],
      ['item:003', { id: '3' }],
    ])

    const page = await fetchPage(storage, 'item:', 2, null)
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.cursor).not.toBeNull()
  })

  it('returns all items when count is under limit', async () => {
    const storage = makeFakeStorage([
      ['item:001', { id: '1' }],
      ['item:002', { id: '2' }],
    ])

    const page = await fetchPage(storage, 'item:', 10, null)
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(false)
    expect(page.cursor).toBeNull()
  })

  it('returns empty page for empty storage', async () => {
    const storage = makeFakeStorage([])
    const page = await fetchPage(storage, 'item:', 10, null)
    expect(page.items).toHaveLength(0)
    expect(page.hasMore).toBe(false)
    expect(page.cursor).toBeNull()
  })

  it('uses cursor to fetch subsequent pages', async () => {
    const entries: [string, unknown][] = Array.from({ length: 5 }, (_, i) => [
      `item:${String(i).padStart(3, '0')}`,
      { id: String(i) },
    ])
    const storage = makeFakeStorage(entries)

    const page1 = await fetchPage(storage, 'item:', 2, null)
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)

    const page2 = await fetchPage(storage, 'item:', 2, page1.cursor)
    expect(page2.items).toHaveLength(2)
    expect(page2.hasMore).toBe(true)

    const page3 = await fetchPage(storage, 'item:', 2, page2.cursor)
    expect(page3.items).toHaveLength(1)
    expect(page3.hasMore).toBe(false)
    expect(page3.cursor).toBeNull()
  })

  it('applies transform function to each item', async () => {
    const storage = makeFakeStorage([
      ['item:001', { raw: true }],
    ])

    const page = await fetchPage<string>(storage, 'item:', 10, null, {
      transform: (key, _val) => `transformed:${key}`,
    })

    expect(page.items[0]).toBe('transformed:item:001')
  })

  it('does not include the extra sentinel item in results', async () => {
    // Fetch exactly limit+1 items — only limit should appear
    const entries: [string, unknown][] = Array.from({ length: 3 }, (_, i) => [
      `n:${String(i).padStart(3, '0')}`,
      { id: i },
    ])
    const storage = makeFakeStorage(entries)

    const page = await fetchPage(storage, 'n:', 2, null)
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
  })

  it('does not leak items from other prefixes', async () => {
    const storage = makeFakeStorage([
      ['note:001', { type: 'note' }],
      ['record:001', { type: 'record' }],
      ['note:002', { type: 'note' }],
    ])

    const page = await fetchPage(storage, 'note:', 10, null)
    expect(page.items).toHaveLength(2)
    // No record items leaked
    expect(page.items).not.toContainEqual({ type: 'record' })
  })
})

// ---------------------------------------------------------------------------
// countByPrefix
// ---------------------------------------------------------------------------

describe('countByPrefix', () => {
  it('counts items under a prefix', async () => {
    const storage = makeFakeStorage([
      ['note:001', {}],
      ['note:002', {}],
      ['record:001', {}],
    ])

    const count = await countByPrefix(storage, 'note:')
    expect(count).toBe(2)
  })

  it('returns 0 for empty prefix', async () => {
    const storage = makeFakeStorage([])
    expect(await countByPrefix(storage, 'note:')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// collectByPrefix
// ---------------------------------------------------------------------------

describe('collectByPrefix', () => {
  it('collects all items for a prefix', async () => {
    const storage = makeFakeStorage([
      ['ev:001', { id: '1' }],
      ['ev:002', { id: '2' }],
      ['other:001', { id: '3' }],
    ])

    const items = await collectByPrefix<{ id: string }>(storage, 'ev:')
    expect(items).toHaveLength(2)
    expect(items).toContainEqual({ id: '1' })
    expect(items).toContainEqual({ id: '2' })
  })

  it('returns empty array when no items match', async () => {
    const storage = makeFakeStorage([])
    const items = await collectByPrefix(storage, 'missing:')
    expect(items).toHaveLength(0)
  })
})
