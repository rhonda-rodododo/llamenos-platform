import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock nostr-tools/pure — verifyEvent returns true for all events in tests
vi.mock('nostr-tools/pure', () => ({
  verifyEvent: vi.fn(() => true),
}))

// Mock platform — signNostrEvent not needed for handleEvent tests
vi.mock('../platform', () => ({
  signNostrEvent: vi.fn(),
}))

// Mock hub-key-manager — decryptFromHub returns JSON content
vi.mock('../hub-key-manager', () => ({
  decryptFromHub: vi.fn((_content: string, _key: Uint8Array) =>
    JSON.stringify({ type: 'call:ring', callId: 'c1' }),
  ),
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
      getHubEventKey: () => new Uint8Array(32),
    })

    handler = vi.fn<NostrEventHandler>()
    // Subscribe to hub-1 events
    manager.subscribe('hub-1', [1000], handler)
  })

  // Access private handleEvent via type assertion for testing
  function callHandleEvent(event: NostrEvent) {
    ;(manager as unknown as { handleEvent(subId: string, event: NostrEvent): void }).handleEvent(
      'sub-1',
      event,
    )
  }

  it('accepts events from the server pubkey', () => {
    const event = makeNostrEvent({ pubkey: SERVER_PUBKEY })
    callHandleEvent(event)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('rejects events from unknown pubkeys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const event = makeNostrEvent({ pubkey: UNKNOWN_PUBKEY })
    callHandleEvent(event)
    expect(handler).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[nostr] Rejected event from unknown publisher:',
      UNKNOWN_PUBKEY,
    )
    warnSpy.mockRestore()
  })

  it('rejects events with empty pubkey', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const event = makeNostrEvent({ pubkey: '' })
    callHandleEvent(event)
    expect(handler).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
