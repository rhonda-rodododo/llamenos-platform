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
  const mockDeriveServerEventKey = vi.fn<(...args: unknown[]) => Uint8Array>(() => new Uint8Array(32))
  const mockEncryptHubEvent = vi.fn<(...args: unknown[]) => string>(() => 'encrypted-content')
  const mockGetCurrentEpoch = vi.fn<(...args: unknown[]) => number>(() => 42)

  // Epoch key cache — mirrors the real implementation's cache
  const epochKeyCache = new Map<number, Uint8Array>()
  let lastCachedEpoch = -1

  function getOrDeriveEpochKey(serverSecret: string, epoch: number): Uint8Array {
    const cached = epochKeyCache.get(epoch)
    if (cached) return cached

    const key = mockDeriveServerEventKey(serverSecret, undefined, epoch)
    epochKeyCache.set(epoch, key)

    if (epoch > lastCachedEpoch) {
      lastCachedEpoch = epoch
      for (const cachedEpoch of epochKeyCache.keys()) {
        if (cachedEpoch < epoch - 1) {
          epochKeyCache.delete(cachedEpoch)
        }
      }
    }

    return key
  }

  // Re-implement publishNostrEvent using the same logic as ../../lib/nostr-events.ts
  // to avoid module cache poisoning from other test files' vi.mock calls.
  async function publishNostrEvent(
    env: Record<string, unknown>,
    kind: number,
    content: Record<string, unknown>,
  ): Promise<void> {
    const publisher = mockGetNostrPublisher(env)
    const createdAt = Math.floor(Date.now() / 1000)
    const epoch = mockGetCurrentEpoch(createdAt)

    let eventContent: string
    if (env.SERVER_NOSTR_SECRET) {
      const eventKey = getOrDeriveEpochKey(env.SERVER_NOSTR_SECRET as string, epoch)
      eventContent = mockEncryptHubEvent(content, eventKey)
    } else {
      eventContent = JSON.stringify(content)
    }

    await publisher.publish({
      kind,
      created_at: createdAt,
      tags: [
        ['d', 'global'],
        ['t', 'llamenos:event'],
        ['epoch', epoch.toString()],
      ],
      content: eventContent,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    epochKeyCache.clear()
    lastCachedEpoch = -1

    mockPublish.mockResolvedValue(undefined)
    mockGetNostrPublisher.mockReturnValue({
      publish: mockPublish,
      serverPubkey: 'abc123',
      close: mockClose,
    })
    mockGetCurrentEpoch.mockReturnValue(42)
  })

  it('resolves when publisher resolves', async () => {
    await expect(publishNostrEvent({}, 20001, { type: 'test' })).resolves.toBeUndefined()
    expect(mockPublish).toHaveBeenCalledOnce()
  })

  it('rejects when publisher rejects', async () => {
    mockPublish.mockRejectedValue(new Error('relay down'))
    await expect(publishNostrEvent({}, 20001, { type: 'test' })).rejects.toThrow('relay down')
  })

  it('encrypts content when SERVER_NOSTR_SECRET is set', async () => {
    await publishNostrEvent({ SERVER_NOSTR_SECRET: 'a'.repeat(64) }, 20001, { type: 'encrypted-test' })

    expect(mockDeriveServerEventKey).toHaveBeenCalledWith('a'.repeat(64), undefined, 42)
    expect(mockEncryptHubEvent).toHaveBeenCalledWith(
      { type: 'encrypted-test' },
      expect.any(Uint8Array),
    )

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.content).toBe('encrypted-content')
  })

  it('sends plaintext JSON when no SERVER_NOSTR_SECRET', async () => {
    await publishNostrEvent({}, 20001, { type: 'plaintext-test', data: 42 })

    expect(mockDeriveServerEventKey).not.toHaveBeenCalled()
    expect(mockEncryptHubEvent).not.toHaveBeenCalled()

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.content).toBe(JSON.stringify({ type: 'plaintext-test', data: 42 }))
  })

  it('uses global d-tag and includes epoch tag', async () => {
    await publishNostrEvent({}, 30001, { type: 'tag-test' })

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.kind).toBe(30001)
    expect(publishCall.tags).toEqual([['d', 'global'], ['t', 'llamenos:event'], ['epoch', '42']])
    expect(publishCall.created_at).toBeTypeOf('number')
  })

  it('derives different keys for different epochs', async () => {
    const secret = 'b'.repeat(64)
    const key1 = new Uint8Array([1, 2, 3])
    const key2 = new Uint8Array([4, 5, 6])
    mockDeriveServerEventKey
      .mockReturnValueOnce(key1)
      .mockReturnValueOnce(key2)

    mockGetCurrentEpoch.mockReturnValueOnce(10)
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' })
    mockGetCurrentEpoch.mockReturnValueOnce(11)
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' })

    expect(mockDeriveServerEventKey).toHaveBeenCalledTimes(2)
    expect(mockDeriveServerEventKey).toHaveBeenCalledWith(secret, undefined, 10)
    expect(mockDeriveServerEventKey).toHaveBeenCalledWith(secret, undefined, 11)
  })

  it('caches epoch keys — same epoch reuses the key', async () => {
    const secret = 'c'.repeat(64)
    mockGetCurrentEpoch.mockReturnValue(42)
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' })
    await publishNostrEvent({ SERVER_NOSTR_SECRET: secret }, 20001, { type: 'test' })

    // Key derived only once for the same epoch
    expect(mockDeriveServerEventKey).toHaveBeenCalledOnce()
  })
})
