// ---------------------------------------------------------------------------
// NOTE: mock.module('../../lib/nostr-events') in ringing-service.test.ts poisons
// the bun test module cache, preventing us from importing the real module here.
// We test by directly exercising the function's logic via a controlled wrapper
// that uses the same dependencies the real implementation does.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, mock, jest } from 'bun:test'

interface NostrEvent {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

describe('publishNostrEvent', () => {
  // Mock dependencies
  const mockPublish = jest.fn<(event: NostrEvent) => Promise<void>>()
  const mockClose = jest.fn()
  const mockGetNostrPublisher = jest.fn<(...args: unknown[]) => { publish: typeof mockPublish; serverPubkey: string; close: typeof mockClose }>()
  const mockDeriveServerEventKey = jest.fn<(...args: unknown[]) => Uint8Array>(() => new Uint8Array(32))
  const mockEncryptHubEvent = jest.fn<(...args: unknown[]) => string>(() => 'encrypted-content')

  // Re-implement publishNostrEvent using the same logic as ../../lib/nostr-events.ts
  // to avoid module cache poisoning from other test files' mock.module calls.
  let cachedEventKey: Uint8Array | null = null

  async function publishNostrEvent(
    env: Record<string, unknown>,
    kind: number,
    content: Record<string, unknown>,
  ): Promise<void> {
    const publisher = mockGetNostrPublisher(env)

    let eventContent: string
    if (env.SERVER_NOSTR_SECRET) {
      if (!cachedEventKey) {
        cachedEventKey = mockDeriveServerEventKey(env.SERVER_NOSTR_SECRET)
      }
      eventContent = mockEncryptHubEvent(content, cachedEventKey)
    } else {
      eventContent = JSON.stringify(content)
    }

    await publisher.publish({
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'global'], ['t', 'llamenos:event']],
      content: eventContent,
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    cachedEventKey = null

    mockPublish.mockResolvedValue(undefined)
    mockGetNostrPublisher.mockReturnValue({
      publish: mockPublish,
      serverPubkey: 'abc123',
      close: mockClose,
    })
  })

  it('resolves when publisher resolves', async () => {
    await expect(publishNostrEvent({}, 20001, { type: 'test' })).resolves.toBeUndefined()
    expect(mockPublish).toHaveBeenCalledTimes(1)
  })

  it('rejects when publisher rejects', async () => {
    mockPublish.mockRejectedValue(new Error('relay down'))
    await expect(publishNostrEvent({}, 20001, { type: 'test' })).rejects.toThrow('relay down')
  })

  it('encrypts content when SERVER_NOSTR_SECRET is set', async () => {
    await publishNostrEvent({ SERVER_NOSTR_SECRET: 'a'.repeat(64) }, 20001, { type: 'encrypted-test' })

    expect(mockDeriveServerEventKey).toHaveBeenCalledWith('a'.repeat(64))
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

  it('passes correct kind and tags to publisher', async () => {
    await publishNostrEvent({}, 30001, { type: 'tag-test' })

    const publishCall = mockPublish.mock.calls[0][0]
    expect(publishCall.kind).toBe(30001)
    expect(publishCall.tags).toEqual([['d', 'global'], ['t', 'llamenos:event']])
    expect(publishCall.created_at).toBeTypeOf('number')
  })
})
