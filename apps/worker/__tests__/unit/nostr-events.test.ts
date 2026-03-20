import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module under test
vi.mock('@worker/lib/service-factories', () => ({
  getNostrPublisher: vi.fn(),
}))

vi.mock('@worker/lib/hub-event-crypto', () => ({
  deriveServerEventKey: vi.fn(() => new Uint8Array(32)),
  encryptHubEvent: vi.fn(() => 'encrypted-content'),
}))

import { publishNostrEvent } from '@worker/lib/nostr-events'
import { getNostrPublisher } from '@worker/lib/service-factories'
import { deriveServerEventKey, encryptHubEvent } from '@worker/lib/hub-event-crypto'

const mockGetNostrPublisher = vi.mocked(getNostrPublisher)
const mockDeriveServerEventKey = vi.mocked(deriveServerEventKey)
const mockEncryptHubEvent = vi.mocked(encryptHubEvent)

function createMockEnv(overrides: Partial<{ SERVER_NOSTR_SECRET: string }> = {}) {
  return overrides as Parameters<typeof publishNostrEvent>[0]
}

describe('publishNostrEvent', () => {
  let mockPublisher: { publish: ReturnType<typeof vi.fn>; serverPubkey: string; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
      serverPubkey: 'abc123',
      close: vi.fn(),
    }
    mockGetNostrPublisher.mockReturnValue(mockPublisher as any)
  })

  it('resolves when publisher resolves', async () => {
    const env = createMockEnv()
    await expect(publishNostrEvent(env, 20001, { type: 'test' })).resolves.toBeUndefined()
    expect(mockPublisher.publish).toHaveBeenCalledOnce()
  })

  it('rejects when publisher rejects', async () => {
    mockPublisher.publish.mockRejectedValue(new Error('relay down'))
    const env = createMockEnv()
    await expect(publishNostrEvent(env, 20001, { type: 'test' })).rejects.toThrow('relay down')
  })

  it('encrypts content when SERVER_NOSTR_SECRET is set', async () => {
    const env = createMockEnv({ SERVER_NOSTR_SECRET: 'a'.repeat(64) })
    await publishNostrEvent(env, 20001, { type: 'encrypted-test' })

    expect(mockDeriveServerEventKey).toHaveBeenCalledWith('a'.repeat(64))
    expect(mockEncryptHubEvent).toHaveBeenCalledWith(
      { type: 'encrypted-test' },
      expect.any(Uint8Array),
    )

    const publishCall = mockPublisher.publish.mock.calls[0][0]
    expect(publishCall.content).toBe('encrypted-content')
  })

  it('sends plaintext JSON when no SERVER_NOSTR_SECRET', async () => {
    const env = createMockEnv()
    await publishNostrEvent(env, 20001, { type: 'plaintext-test', data: 42 })

    expect(mockDeriveServerEventKey).not.toHaveBeenCalled()
    expect(mockEncryptHubEvent).not.toHaveBeenCalled()

    const publishCall = mockPublisher.publish.mock.calls[0][0]
    expect(publishCall.content).toBe(JSON.stringify({ type: 'plaintext-test', data: 42 }))
  })

  it('passes correct kind and tags to publisher', async () => {
    const env = createMockEnv()
    await publishNostrEvent(env, 30001, { type: 'tag-test' })

    const publishCall = mockPublisher.publish.mock.calls[0][0]
    expect(publishCall.kind).toBe(30001)
    expect(publishCall.tags).toEqual([['d', 'global'], ['t', 'llamenos:event']])
    expect(publishCall.created_at).toBeTypeOf('number')
  })
})
