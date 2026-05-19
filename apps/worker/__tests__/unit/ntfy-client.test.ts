/**
 * Unit tests for apps/worker/lib/ntfy-client.ts
 *
 * Tests ntfy push relay client: success, endpoint cleanup on 404/410,
 * transient error handling, and auth header injection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NtfyClient } from '@worker/lib/ntfy-client'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@worker/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe('NtfyClient', () => {
  const baseUrl = 'http://ntfy:80'

  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends payload to endpoint URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const client = new NtfyClient(baseUrl, 'test-token')
    const result = await client.send({
      endpoint: 'http://ntfy:80/up-topic-abc',
      data: 'encrypted-payload',
      priority: 'high',
    })

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('http://ntfy:80/up-topic-abc')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBe('encrypted-payload')
    expect(opts.headers['Priority']).toBe('5')
  })

  it('adds Authorization header for own-instance endpoints', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const client = new NtfyClient(baseUrl, 'my-secret-token')
    await client.send({
      endpoint: 'http://ntfy:80/up-topic-abc',
      data: 'data',
      priority: 'default',
    })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer my-secret-token')
  })

  it('does not add auth header for external endpoints', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const client = new NtfyClient(baseUrl, 'my-secret-token')
    await client.send({
      endpoint: 'https://external-ntfy.example.com/up-topic',
      data: 'data',
      priority: 'default',
    })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBeUndefined()
  })

  it('returns false on 404 (endpoint gone)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('not found') })

    const client = new NtfyClient(baseUrl)
    const result = await client.send({
      endpoint: 'http://ntfy:80/up-topic-expired',
      data: 'data',
      priority: 'default',
    })

    expect(result).toBe(false)
  })

  it('returns false on 410 (endpoint gone)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 410, text: () => Promise.resolve('gone') })

    const client = new NtfyClient(baseUrl)
    const result = await client.send({
      endpoint: 'http://ntfy:80/up-topic-gone',
      data: 'data',
      priority: 'default',
    })

    expect(result).toBe(false)
  })

  it('throws on server error (transient)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('internal error') })

    const client = new NtfyClient(baseUrl)
    await expect(
      client.send({
        endpoint: 'http://ntfy:80/up-topic',
        data: 'data',
        priority: 'default',
      }),
    ).rejects.toThrow('ntfy publish failed: 500')
  })

  it('throws on network error (transient)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const client = new NtfyClient(baseUrl)
    await expect(
      client.send({
        endpoint: 'http://ntfy:80/up-topic',
        data: 'data',
        priority: 'default',
      }),
    ).rejects.toThrow('ECONNREFUSED')
  })

  it('sets default priority for non-high messages', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const client = new NtfyClient(baseUrl)
    await client.send({
      endpoint: 'http://ntfy:80/up-topic',
      data: 'data',
      priority: 'default',
    })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Priority']).toBeUndefined()
  })

  it('publishToTopic constructs full URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const client = new NtfyClient(baseUrl, 'tok')
    await client.publishToTopic('my-topic', 'payload', 'high')

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('http://ntfy:80/my-topic')
  })
})
