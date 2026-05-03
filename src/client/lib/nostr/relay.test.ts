import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock nostr-tools/pure — verifyEvent returns true for all events in tests
vi.mock('nostr-tools/pure', () => ({
  verifyEvent: vi.fn(() => true),
}))

// Mock platform — includes decryptHubEvent and decryptServerEvent for relay event handling
vi.mock('../platform', () => ({
  signNostrEvent: vi.fn(),
  decryptHubEvent: vi.fn().mockResolvedValue(JSON.stringify({ type: 'call:ring', callId: 'c1' })),
  decryptServerEvent: vi.fn().mockResolvedValue(JSON.stringify({ type: 'call:ring', callId: 'c1' })),
}))

// Mock events — validateLlamenosEvent returns true, others pass through
vi.mock('./events', () => ({
  EventDeduplicator: class {
    isNew = vi.fn(() => true)
    destroy = vi.fn()
  },
  validateLlamenosEvent: vi.fn(() => true),
  parseLlamenosContent: vi.fn((str: string | null) => {
    if (!str) return null
    try {
      const parsed = JSON.parse(str)
      return typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string'
        ? parsed
        : null
    } catch {
      return null
    }
  }),
}))

import { RelayManager } from './relay'
import type { Event as NostrEvent } from 'nostr-tools/core'
import type { NostrEventHandler } from './types'

const SERVER_PUBKEY = 'aa'.repeat(32)
const UNKNOWN_PUBKEY = 'bb'.repeat(32)

function makeNostrEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'evt-' + Math.random().toString(36).slice(2, 10),
    pubkey: SERVER_PUBKEY,
    kind: 1000,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'hub-1'], ['t', 'llamenos:event']],
    content: 'encrypted-content',
    sig: 'deadbeef',
    ...overrides,
  }
}

describe('RelayManager publisher verification (C2)', () => {
  let manager: RelayManager
  let handler: NostrEventHandler

  beforeEach(() => {
    manager = new RelayManager({
      relayUrl: 'ws://localhost:7777',
      serverPubkey: SERVER_PUBKEY,
      getHubKey: () => new Uint8Array(32),
    })

    handler = vi.fn<NostrEventHandler>()
    // Subscribe to hub-1 events
    manager.subscribe('hub-1', [1000], handler)
  })

  // Access private handleEvent via type assertion for testing (async in Phase 2)
  async function callHandleEvent(event: NostrEvent) {
    await (manager as unknown as { handleEvent(subId: string, event: NostrEvent): Promise<void> }).handleEvent(
      'sub-1',
      event,
    )
  }

  it('accepts events from the server pubkey', async () => {
    const event = makeNostrEvent({ pubkey: SERVER_PUBKEY })
    await callHandleEvent(event)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('rejects events from unknown pubkeys', async () => {
    const event = makeNostrEvent({ pubkey: UNKNOWN_PUBKEY })
    await callHandleEvent(event)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects events with empty pubkey', async () => {
    const event = makeNostrEvent({ pubkey: '' })
    await callHandleEvent(event)
    expect(handler).not.toHaveBeenCalled()
  })
})
