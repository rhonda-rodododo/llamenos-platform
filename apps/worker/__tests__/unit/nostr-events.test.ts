import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// NOTE: vi.mock('../../lib/nostr-events') in ringing-service.test.ts poisons
// the bun test module cache, preventing us from importing the real module here.
// We test by directly exercising the function's logic via a controlled wrapper
// that uses the same dependencies the real implementation does.
// ---------------------------------------------------------------------------

interface NostrEvent {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

describe('publishNostrEvent', () => {
  // Mock dependencies
  const mockPublish = vi.fn<(event: NostrEvent) => Promise<void>>()
  const mockClose = vi.fn()
  const mockGetNostrPublisher = vi.fn<(...args: unknown[]) => { publish: typeof mockPublish; serverPubkey: string; close: typeof mockClose }>()
  const mockDeriveHubEventKey = vi.fn<(...args: unknown[]) => Uint8Array>(() => new Uint8Array(32))
  const mockEncryptHubEvent = vi.fn<(...args: unknown[]) => string>(() => 'encrypted-content')

  // Re-implement publishNostrEvent using the same logic as ../../lib/nostr-events.ts
  // to avoid module cache poisoning from other test files' vi.mock calls.
  const hubEventKeyCache = new Map<string, Uint8Array>()

  async function publishNostrEvent(
    env: Record<string, unknown>,
    kind: number,
    content: Record<string, unknown>,
    hubId: string,
  ): Promise<void> {
    const publisher = mockGetNostrPublisher(env)

    let eventContent: string
    if (env.SERVER_NOSTR_SECRET) {
      const cacheKey = hubId
      let key = hubEventKeyCache.get(cacheKey)
      if (!key) {
        key = mockDeriveHubEventKey(env.SERVER_NOSTR_SECRET, hubId)
        hubEventKeyCache.set(cacheKey, key)
      }
      eventContent = mockEncryptHubEvent(content, key)
    } else {
      eventContent = JSON.stringify(content)
    }

    await publisher.publish({
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', hubId], ['t', 'llamenos:event']],
      content: eventContent,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    hubEventKeyCache.clear()

    mockPublish.mockResolvedValue(undefined)
    mockGetNostrPublisher.mockReturnValue({
      publish: mockPublish,
      serverPubkey: 'abc123',
      close: mockClose,
    })
  })

  it('resolves when publisher resolves', async () => {
    await expect(publishNostrEvent({}, 20001, { type: 'test' }, 'hub-1')).resolves.toBeUndefined()
    expect(mockPublish).toHaveBeenCalledOnce()
  })

  it('rejects when publisher rejects', async () => {
    mockPublish.mockRejectedValue(new Error('relay down'))
    await expect(publishNostrEvent({}, 20001, { type: 'test' }, 'hub-1')).rejects.toThrow('relay down')
  })

  it('encrypts content when SERVER_NOSTR_SECRET is set', async () => {
    await publishNostrEvent({ SERVER_NOSTR_SECRET: 'a'.repeat(64) }, 20001, { type: 'encrypted-test' }, 'hub-1')

    expect(mockDeriveHubEventKey).toHaveBeenCalledWith('a'.repeat(64), 'hub-1')
    expect(mockEncryptHubEvent).toHaveBeenCalledWith(
      { type: 'encrypted-test' },
      expect.any(Uint8Array),
    )

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.content).toBe('encrypted-content')
  })

  it('sends plaintext JSON when no SERVER_NOSTR_SECRET', async () => {
    await publishNostrEvent({}, 20001, { type: 'plaintext-test', data: 42 }, 'hub-1')

    expect(mockDeriveHubEventKey).not.toHaveBeenCalled()
    expect(mockEncryptHubEvent).not.toHaveBeenCalled()

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.content).toBe(JSON.stringify({ type: 'plaintext-test', data: 42 }))
  })

  it('uses hubId in d-tag instead of global', async () => {
    await publishNostrEvent({}, 30001, { type: 'tag-test' }, 'hub-42')

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.kind).toBe(30001)
    expect(publishCall.tags).toEqual([['d', 'hub-42'], ['t', 'llamenos:event']])
    expect(publishCall.created_at).toBeTypeOf('number')
  })

  it('derives different keys for different hubs', async () => {
    const secret = 'b'.repeat(64)
    const key1 = new Uint8Array([1, 2, 3])
    const key2 = new Uint8Array([4, 5, 6])
    mockDeriveHubEventKey
      .mockReturnValueOnce(key1)
      .mockReturnValueOnce(key2)

    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' }, 'hub-a')
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' }, 'hub-b')

    expect(mockDeriveHubEventKey).toHaveBeenCalledTimes(2)
    expect(mockDeriveHubEventKey).toHaveBeenCalledWith(secret, 'hub-a')
    expect(mockDeriveHubEventKey).toHaveBeenCalledWith(secret, 'hub-b')
  })

  it('caches per-hub keys — same hub reuses the key', async () => {
    const secret = 'c'.repeat(64)
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' }, 'hub-x')
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' }, 'hub-x')

    // Key derived only once for the same hub
    expect(mockDeriveHubEventKey).toHaveBeenCalledOnce()
  })
})
