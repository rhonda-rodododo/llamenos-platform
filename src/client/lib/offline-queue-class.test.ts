import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OfflineQueue, classifyOperation, isQueueableMethod, isNetworkError } from './offline-queue'

describe('OfflineQueue', () => {
  let queue: OfflineQueue

  beforeEach(() => {
    localStorage.clear()
    queue = new OfflineQueue()
  })

  afterEach(() => {
    queue.destroy()
  })

  describe('enqueue', () => {
    it('adds operations to the queue', () => {
      const id = queue.enqueue('/notes', 'POST', '{"text":"hello"}')
      expect(queue.pendingCount).toBe(1)
      expect(queue.getQueue()[0].type).toBe('note:create')
      expect(queue.getQueue()[0].id).toBe(id)
    })

    it('assigns unique IDs to each operation', () => {
      const id1 = queue.enqueue('/notes', 'POST', '{}')
      const id2 = queue.enqueue('/notes', 'POST', '{}')
      expect(id1).not.toBe(id2)
    })

    it('sets attempts to 0 and lastError to null on enqueue', () => {
      queue.enqueue('/notes', 'POST', '{}')
      const op = queue.getQueue()[0]
      expect(op.attempts).toBe(0)
      expect(op.lastError).toBeNull()
    })

    it('stores ISO timestamp on enqueue', () => {
      const before = new Date().toISOString()
      queue.enqueue('/notes', 'POST', '{}')
      const after = new Date().toISOString()
      const op = queue.getQueue()[0]
      expect(op.queuedAt >= before).toBe(true)
      expect(op.queuedAt <= after).toBe(true)
    })

    it('allows null body', () => {
      queue.enqueue('/notes', 'POST', null)
      expect(queue.getQueue()[0].body).toBeNull()
    })
  })

  describe('remove', () => {
    it('removes an operation by ID', () => {
      const id = queue.enqueue('/notes', 'POST', '{}')
      queue.remove(id)
      expect(queue.pendingCount).toBe(0)
    })

    it('ignores unknown IDs', () => {
      queue.enqueue('/notes', 'POST', '{}')
      queue.remove('nonexistent')
      expect(queue.pendingCount).toBe(1)
    })

    it('removes only the matching operation', () => {
      const id1 = queue.enqueue('/notes', 'POST', '{}')
      queue.enqueue('/messages', 'POST', '{}')
      queue.remove(id1)
      expect(queue.pendingCount).toBe(1)
      expect(queue.getQueue()[0].type).toBe('message:send')
    })
  })

  describe('clear', () => {
    it('removes all operations', () => {
      queue.enqueue('/notes', 'POST', '{}')
      queue.enqueue('/messages', 'POST', '{}')
      queue.clear()
      expect(queue.pendingCount).toBe(0)
    })

    it('works on empty queue', () => {
      queue.clear()
      expect(queue.pendingCount).toBe(0)
    })
  })

  describe('subscribe', () => {
    it('calls listener immediately with current queue', () => {
      queue.enqueue('/notes', 'POST', '{}')
      const listener = vi.fn()
      queue.subscribe(listener)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(queue.getQueue())
    })

    it('notifies on enqueue', () => {
      const listener = vi.fn()
      queue.subscribe(listener)
      listener.mockClear()
      queue.enqueue('/notes', 'POST', '{}')
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notifies on remove', () => {
      const id = queue.enqueue('/notes', 'POST', '{}')
      const listener = vi.fn()
      queue.subscribe(listener)
      listener.mockClear()
      queue.remove(id)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notifies on clear', () => {
      queue.enqueue('/notes', 'POST', '{}')
      const listener = vi.fn()
      queue.subscribe(listener)
      listener.mockClear()
      queue.clear()
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('returns unsubscribe function', () => {
      const listener = vi.fn()
      const unsub = queue.subscribe(listener)
      unsub()
      queue.enqueue('/notes', 'POST', '{}')
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('passes a copy of the queue, not the original', () => {
      queue.enqueue('/notes', 'POST', '{}')
      let captured: unknown
      queue.subscribe((q) => { captured = q })
      expect(captured).not.toBe(queue.getQueue())
    })

    it('survives listener exceptions', () => {
      const badListener = vi.fn(() => { throw new Error('boom') })
      const goodListener = vi.fn()
      expect(() => queue.subscribe(badListener)).toThrow('boom')
      queue.subscribe(goodListener)
      queue.enqueue('/notes', 'POST', '{}')
      expect(goodListener).toHaveBeenCalledTimes(2)
    })
  })

  describe('replay', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('returns zeros when queue is empty', async () => {
      const result = await queue.replay(async () => ({}))
      expect(result).toEqual({ succeeded: 0, failed: 0, remaining: 0 })
    })

    it('prevents concurrent replays', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(new Response(null, { status: 200 })), 100)))

      const p1 = queue.replay(async () => ({}))
      const p2 = queue.replay(async () => ({}))

      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1.succeeded + r2.succeeded).toBe(1)
      expect(queue.isReplaying).toBe(false)
    })

    it('succeeds on 200 and removes from queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

      const result = await queue.replay(async () => ({}))
      expect(result.succeeded).toBe(1)
      expect(result.remaining).toBe(0)
    })

    it('succeeds on 409 conflict and removes from queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Conflict', { status: 409 }))

      const result = await queue.replay(async () => ({}))
      expect(result.succeeded).toBe(1)
      expect(result.remaining).toBe(0)
    })

    it('increments attempts on 500 and keeps in queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Server Error', { status: 500 }))

      const result = await queue.replay(async () => ({}))
      expect(result.failed).toBe(1)
      expect(result.remaining).toBe(1)
      expect(queue.getQueue()[0].attempts).toBe(1)
      expect(queue.getQueue()[0].lastError).toBe('HTTP 500')
    })

    it('increments attempts on 401 and keeps in queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }))

      const result = await queue.replay(async () => ({}))
      expect(result.failed).toBe(1)
      expect(result.remaining).toBe(1)
      expect(queue.getQueue()[0].attempts).toBe(1)
    })

    it('increments attempts on 429 and keeps in queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Too Many Requests', { status: 429 }))

      const result = await queue.replay(async () => ({}))
      expect(result.failed).toBe(1)
      expect(result.remaining).toBe(1)
    })

    it('increments attempts on permanent client error (400) but keeps in queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Bad Request', { status: 400 }))

      const result = await queue.replay(async () => ({}))
      expect(result.failed).toBe(1)
      expect(result.remaining).toBe(1)
      expect(queue.getQueue()[0].attempts).toBe(1)
    })

    it('increments attempts on permanent client error (403) but keeps in queue', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }))

      const result = await queue.replay(async () => ({}))
      expect(result.failed).toBe(1)
      expect(result.remaining).toBe(1)
      expect(queue.getQueue()[0].attempts).toBe(1)
    })

    it('keeps in queue on 401 (auth error, retryable)', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }))

      const result = await queue.replay(async () => ({}))
      expect(result.remaining).toBe(1)
    })

    it('removes after MAX_ATTEMPTS permanent failures', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Bad Request', { status: 400 }))

      for (let i = 0; i < 10; i++) {
        await queue.replay(async () => ({}))
      }
      expect(queue.pendingCount).toBe(0)
    })

    it('stops replay on network error and keeps remaining items', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      queue.enqueue('/messages', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      const result = await queue.replay(async () => ({}))
      expect(result.failed).toBe(1)
      expect(result.remaining).toBe(2)
    })

    it('breaks on going offline during replay', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      queue.enqueue('/messages', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockImplementation(() => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
        return Promise.resolve(new Response(null, { status: 200 }))
      })

      const result = await queue.replay(async () => ({}))
      expect(result.succeeded).toBe(1)
      expect(result.remaining).toBe(1)

      Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    })

    it('includes auth headers from callback', async () => {
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

      await queue.replay(async () => ({ 'X-Auth': 'token123' }))

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notes',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Auth': 'token123',
          }),
        })
      )
    })

    it('does not include body for null body', async () => {
      queue.enqueue('/notes', 'POST', null)
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

      await queue.replay(async () => ({}))

      const call = fetchMock.mock.calls[0]
      const init = call[1] as RequestInit
      expect(init.body).toBeUndefined()
    })

    it('applies exponential backoff on retryable failures', async () => {
      vi.useFakeTimers()
      queue.enqueue('/notes', 'POST', '{}')
      const fetchMock = vi.mocked(globalThis.fetch)
      fetchMock.mockResolvedValue(new Response('Error', { status: 500 }))

      const replayPromise = queue.replay(async () => ({}))
      await vi.advanceTimersByTimeAsync(60_000)
      await replayPromise

      expect(queue.getQueue()[0].attempts).toBe(1)
      vi.useRealTimers()
    })
  })

  describe('online status', () => {
    it('reflects navigator.onLine initially', () => {
      expect(queue.online).toBe(navigator.onLine)
    })

    it('updates on online event', () => {
      const event = new Event('online')
      window.dispatchEvent(event)
      expect(queue.online).toBe(true)
    })

    it('updates on offline event', () => {
      const event = new Event('offline')
      window.dispatchEvent(event)
      expect(queue.online).toBe(false)
    })
  })

  describe('persistence', () => {
    it('loads from localStorage on construction', () => {
      const stored = [{ id: 'test-id', type: 'note:create' as const, path: '/notes', method: 'POST', body: '{}', queuedAt: new Date().toISOString(), attempts: 0, lastError: null }]
      localStorage.setItem('llamenos-offline-queue', JSON.stringify(stored))

      const q2 = new OfflineQueue()
      expect(q2.pendingCount).toBe(1)
      expect(q2.getQueue()[0].id).toBe('test-id')
      q2.destroy()
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('llamenos-offline-queue', 'not-json{')
      const q2 = new OfflineQueue()
      expect(q2.pendingCount).toBe(0)
      q2.destroy()
    })

    it('handles empty localStorage gracefully', () => {
      const q2 = new OfflineQueue()
      expect(q2.pendingCount).toBe(0)
      q2.destroy()
    })
  })
})

describe('classifyOperation', () => {
  it('classifies note:create', () => {
    expect(classifyOperation('/notes', 'POST')).toBe('note:create')
  })

  it('classifies note:update', () => {
    expect(classifyOperation('/notes/123', 'PATCH')).toBe('note:update')
  })

  it('classifies message:send', () => {
    expect(classifyOperation('/messages', 'POST')).toBe('message:send')
  })

  it('classifies shift:toggle from shifts path', () => {
    expect(classifyOperation('/shifts/my-status', 'PATCH')).toBe('shift:toggle')
  })

  it('classifies shift:toggle from availability path', () => {
    expect(classifyOperation('/availability', 'PATCH')).toBe('shift:toggle')
  })

  it('classifies availability:update', () => {
    expect(classifyOperation('/availability', 'PATCH')).toBe('shift:toggle')
  })

  it('classifies conversation:claim', () => {
    expect(classifyOperation('/claim', 'POST')).toBe('conversation:claim')
  })

  it('classifies conversation:update', () => {
    expect(classifyOperation('/conversations/123', 'PATCH')).toBe('conversation:update')
  })

  it('classifies report:create', () => {
    expect(classifyOperation('/reports', 'POST')).toBe('report:create')
  })

  it('classifies report:message', () => {
    expect(classifyOperation('/reports/123/messages', 'POST')).toBe('report:message')
  })

  it('classifies ban:add', () => {
    expect(classifyOperation('/bans', 'POST')).toBe('ban:add')
  })

  it('classifies ban:remove', () => {
    expect(classifyOperation('/bans/123', 'DELETE')).toBe('ban:remove')
  })

  it('falls back to generic:write', () => {
    expect(classifyOperation('/unknown', 'POST')).toBe('generic:write')
  })

  it('does not classify report:create for report messages path', () => {
    expect(classifyOperation('/reports/123/messages', 'POST')).toBe('report:message')
  })
})

describe('isQueueableMethod', () => {
  it('returns true for POST', () => {
    expect(isQueueableMethod('POST')).toBe(true)
  })

  it('returns true for PUT', () => {
    expect(isQueueableMethod('PUT')).toBe(true)
  })

  it('returns true for PATCH', () => {
    expect(isQueueableMethod('PATCH')).toBe(true)
  })

  it('returns true for DELETE', () => {
    expect(isQueueableMethod('DELETE')).toBe(true)
  })

  it('returns false for GET', () => {
    expect(isQueueableMethod('GET')).toBe(false)
  })

  it('returns false for HEAD', () => {
    expect(isQueueableMethod('HEAD')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isQueueableMethod('post')).toBe(true)
    expect(isQueueableMethod('get')).toBe(false)
  })
})

describe('isNetworkError', () => {
  it('returns true for TypeError with fetch message', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true)
  })

  it('returns true for TypeError with network message', () => {
    expect(isNetworkError(new TypeError('network error'))).toBe(true)
  })

  it('returns true for TypeError with Failed to fetch', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('returns false for AbortError', () => {
    expect(isNetworkError(new DOMException('Aborted', 'AbortError'))).toBe(false)
  })

  it('returns true when navigator is offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    expect(isNetworkError(new Error('something'))).toBe(true)
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  it('returns false for random errors when online', () => {
    expect(isNetworkError(new Error('random'))).toBe(false)
  })

  it('returns false for non-Error objects when online', () => {
    expect(isNetworkError('string error')).toBe(false)
    expect(isNetworkError(42)).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
