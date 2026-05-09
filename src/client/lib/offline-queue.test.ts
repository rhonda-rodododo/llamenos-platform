import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifyOperation, isQueueableMethod, isNetworkError } from './offline-queue'

describe('classifyOperation', () => {
  it('classifies note creation', () => {
    expect(classifyOperation('/notes', 'POST')).toBe('note:create')
  })

  it('classifies note update', () => {
    expect(classifyOperation('/notes/123', 'PATCH')).toBe('note:update')
  })

  it('classifies message send', () => {
    expect(classifyOperation('/messages', 'POST')).toBe('message:send')
  })

  it('classifies shift toggle via shifts path', () => {
    expect(classifyOperation('/shifts/my-status', 'POST')).toBe('shift:toggle')
  })

  it('classifies shift toggle via availability path', () => {
    expect(classifyOperation('/availability', 'POST')).toBe('shift:toggle')
  })

  it('classifies availability update', () => {
    expect(classifyOperation('/availability', 'PATCH')).toBe('shift:toggle')
  })

  it('classifies conversation claim', () => {
    expect(classifyOperation('/claim', 'POST')).toBe('conversation:claim')
  })

  it('classifies conversation update', () => {
    expect(classifyOperation('/conversations/123', 'PATCH')).toBe('conversation:update')
  })

  it('classifies report creation', () => {
    expect(classifyOperation('/reports', 'POST')).toBe('report:create')
  })

  it('classifies report message', () => {
    expect(classifyOperation('/reports/123/messages', 'POST')).toBe('message:send')
  })

  it('classifies ban add', () => {
    expect(classifyOperation('/bans', 'POST')).toBe('ban:add')
  })

  it('classifies ban remove', () => {
    expect(classifyOperation('/bans/123', 'DELETE')).toBe('ban:remove')
  })

  it('falls back to generic:write for unknown paths', () => {
    expect(classifyOperation('/unknown', 'POST')).toBe('generic:write')
  })

  it('falls back to generic:write for read methods', () => {
    expect(classifyOperation('/notes', 'GET')).toBe('generic:write')
  })
})

describe('isQueueableMethod', () => {
  it('returns true for POST', () => {
    expect(isQueueableMethod('POST')).toBe(true)
    expect(isQueueableMethod('post')).toBe(true)
  })

  it('returns true for PUT', () => {
    expect(isQueueableMethod('PUT')).toBe(true)
    expect(isQueueableMethod('put')).toBe(true)
  })

  it('returns true for PATCH', () => {
    expect(isQueueableMethod('PATCH')).toBe(true)
    expect(isQueueableMethod('patch')).toBe(true)
  })

  it('returns true for DELETE', () => {
    expect(isQueueableMethod('DELETE')).toBe(true)
    expect(isQueueableMethod('delete')).toBe(true)
  })

  it('returns false for GET', () => {
    expect(isQueueableMethod('GET')).toBe(false)
    expect(isQueueableMethod('get')).toBe(false)
  })

  it('returns false for HEAD', () => {
    expect(isQueueableMethod('HEAD')).toBe(false)
  })

  it('returns false for OPTIONS', () => {
    expect(isQueueableMethod('OPTIONS')).toBe(false)
  })
})

describe('isNetworkError', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true for TypeError with fetch message', () => {
    const err = new TypeError('fetch failed')
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns true for TypeError with network message', () => {
    const err = new TypeError('network error')
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns true for TypeError with Failed to fetch message', () => {
    const err = new TypeError('Failed to fetch')
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns false for AbortError', () => {
    const err = new DOMException('Aborted', 'AbortError')
    expect(isNetworkError(err)).toBe(false)
  })

  it('returns false for generic Error', () => {
    const err = new Error('something else')
    expect(isNetworkError(err)).toBe(false)
  })

  it('returns false when online and no matching error', () => {
    const err = new TypeError('other')
    expect(isNetworkError(err)).toBe(false)
  })

  it('returns true when offline regardless of error type', () => {
    vi.stubGlobal('navigator', { onLine: false })
    const err = new Error('anything')
    expect(isNetworkError(err)).toBe(true)
  })
})
