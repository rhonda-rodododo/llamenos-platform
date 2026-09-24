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

const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@worker/lib/logger', () => ({
  createLogger: () => mockLog,
}))

describe('NtfyClient', () => {
  const baseUrl = 'http://ntfy:80'

  beforeEach(() => {
    mockFetch.mockReset()
    for (const fn of Object.values(mockLog)) fn.mockReset()
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

  // #960 — the client is the last line of defence: it must never POST a wake
  // signal to a host other than the operator's own relay, even for a row that
  // was stored before registration-time validation existed.
  describe('endpoint origin enforcement (#960)', () => {
    const trusted = 'https://push.hotline.example.org'

    it('refuses the public ntfy.sh server and never calls fetch', async () => {
      const client = new NtfyClient(trusted, 'my-secret-token')
      const result = await client.send({ endpoint: 'https://ntfy.sh/up-topic', data: 'data', priority: 'high' })

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it.each([
      ['look-alike suffix host', `${trusted}.evil.example/up-topic`],
      ['userinfo trick', 'https://push.hotline.example.org@evil.example/up-topic'],
      ['userinfo on trusted host', 'https://user:pw@push.hotline.example.org/up-topic'],
      ['http downgrade', 'http://push.hotline.example.org/up-topic'],
      ['different port', 'https://push.hotline.example.org:8443/up-topic'],
      ['unparseable token', 'not-a-url'],
      ['non-http scheme', 'ftp://push.hotline.example.org/up-topic'],
    ])('refuses %s', async (_label, endpoint) => {
      const client = new NtfyClient(trusted, 'my-secret-token')
      expect(await client.send({ endpoint, data: 'data', priority: 'default' })).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('accepts the public origin when the internal baseUrl differs, and authenticates', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 })
      const client = new NtfyClient('http://ntfy:80', 'my-secret-token', trusted)

      expect(await client.send({ endpoint: `${trusted}/up-topic`, data: 'data', priority: 'default' })).toBe(true)
      expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer my-secret-token')
    })

    it('normalises default ports when comparing origins', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 })
      const client = new NtfyClient(trusted)
      expect(await client.send({ endpoint: `${trusted}:443/up-topic`, data: 'd', priority: 'default' })).toBe(true)
    })

    it('does not log the refused endpoint', async () => {
      const client = new NtfyClient(trusted)
      await client.send({ endpoint: 'https://ntfy.sh/up-secret-topic-xyz', data: 'd', priority: 'default' })

      const logged = JSON.stringify(Object.values(mockLog).flatMap(fn => fn.mock.calls))
      expect(logged).not.toContain('up-secret-topic-xyz')
      expect(logged).not.toContain('ntfy.sh')
    })
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
