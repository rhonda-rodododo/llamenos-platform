/**
 * Cursor-based pagination helpers for Durable Object storage.
 *
 * Uses DO storage.list() with prefix scanning and startAfter for efficient
 * cursor-based iteration without loading all records into memory.
 */

/** Opaque cursor encoding: base64url of the last key seen */
export function encodeCursor(lastKey: string): string {
  return btoa(lastKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCursor(cursor: string): string {
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - cursor.length % 4) % 4)
  return atob(padded)
}

export interface CursorPage<T> {
  items: T[]
  cursor: string | null
  hasMore: boolean
  total?: number
}

/**
 * Fetch a page of items from DO storage using prefix scan + cursor.
 *
 * @param storage - DO storage instance
 * @param prefix - Storage key prefix to scan
 * @param limit - Max items per page
 * @param cursor - Opaque cursor from previous page (null for first page)
 * @param transform - Optional transform function for each value
 * @returns Page of items with cursor for next page
 */
export async function fetchPage<T>(
  storage: {
    list<V = unknown>(opts?: { prefix?: string; limit?: number; startAfter?: string; reverse?: boolean }): Promise<Map<string, V>>
  },
  prefix: string,
  limit: number,
  cursor: string | null,
  options?: {
    reverse?: boolean
    transform?: (key: string, value: unknown) => T
  },
): Promise<CursorPage<T>> {
  const listOpts: { prefix: string; limit: number; startAfter?: string; reverse?: boolean } = {
    prefix,
    limit: limit + 1, // Fetch one extra to detect hasMore
  }

  if (cursor) {
    listOpts.startAfter = decodeCursor(cursor)
  }
  if (options?.reverse) {
    listOpts.reverse = true
  }

  const entries = await storage.list<T>(listOpts)
  const items: T[] = []
  let lastKey = ''

  for (const [key, value] of entries) {
    if (items.length >= limit) break
    items.push(options?.transform ? options.transform(key, value) : value as T)
    lastKey = key
  }

  const hasMore = entries.size > limit

  return {
    items,
    cursor: hasMore ? encodeCursor(lastKey) : null,
    hasMore,
  }
}

/**
 * Count all items matching a prefix without loading values.
 * Uses list with limit to efficiently scan keys.
 */
export async function countByPrefix(
  storage: { list(opts?: { prefix?: string; limit?: number }): Promise<Map<string, unknown>> },
  prefix: string,
): Promise<number> {
  // DO storage.list() returns up to 1000 at a time by default
  // For accurate counts, we need to iterate
  let count = 0
  let startAfter: string | undefined
  const BATCH = 1000

  while (true) {
    const opts: { prefix: string; limit: number; startAfter?: string } = {
      prefix,
      limit: BATCH,
    }
    if (startAfter) {
      (opts as Record<string, unknown>).startAfter = startAfter
    }
    const entries = await storage.list(opts)
    count += entries.size
    if (entries.size < BATCH) break

    // Get last key for next batch
    let lastKey = ''
    for (const [key] of entries) {
      lastKey = key
    }
    startAfter = lastKey
  }

  return count
}

/**
 * Collect all values matching a prefix into an array.
 * Handles batching for large result sets (>1000 keys).
 */
export async function collectByPrefix<T>(
  storage: { list<V = unknown>(opts?: { prefix?: string; limit?: number; startAfter?: string }): Promise<Map<string, V>> },
  prefix: string,
): Promise<T[]> {
  const results: T[] = []
  let startAfter: string | undefined
  const BATCH = 1000

  while (true) {
    const opts: { prefix: string; limit: number; startAfter?: string } = {
      prefix,
      limit: BATCH,
    }
    if (startAfter) {
      opts.startAfter = startAfter
    }
    const entries = await storage.list<T>(opts)

    for (const [key, value] of entries) {
      results.push(value)
      startAfter = key
    }

    if (entries.size < BATCH) break
  }

  return results
}
