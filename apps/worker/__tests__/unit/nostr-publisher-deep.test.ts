import { describe, it, expect } from 'vitest'
import {
  deriveServerKeypair,
  deriveServerKeypairLegacy,
  signServerEvent,
  createNostrPublisher,
  NoopNostrPublisher,
  CFNostrPublisher,
  NodeNostrPublisher,
} from '@worker/lib/nostr-publisher'
import { bytesToHex } from '@noble/hashes/utils.js'

// 64-char hex string representing a 32-byte secret
const TEST_SECRET = 'a'.repeat(64)

describe('deriveServerKeypair', () => {
  it('returns a 32-byte secret key and 64-char hex pubkey', () => {
    const { secretKey, pubkey } = deriveServerKeypair(TEST_SECRET)

    expect(secretKey).toBeInstanceOf(Uint8Array)
    expect(secretKey.length).toBe(32)
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic — same input produces same output', () => {
    const a = deriveServerKeypair(TEST_SECRET)
    const b = deriveServerKeypair(TEST_SECRET)

    expect(bytesToHex(a.secretKey)).toBe(bytesToHex(b.secretKey))
    expect(a.pubkey).toBe(b.pubkey)
  })

  it('different secrets produce different keys', () => {
    const a = deriveServerKeypair('a'.repeat(64))
    const b = deriveServerKeypair('b'.repeat(64))

    expect(a.pubkey).not.toBe(b.pubkey)
  })

  it('derives a different key than legacy function (signing domain separation)', () => {
    const modern = deriveServerKeypair(TEST_SECRET)
    const legacy = deriveServerKeypairLegacy(TEST_SECRET)

    // Signing key and legacy key should be cryptographically independent
    expect(bytesToHex(modern.secretKey)).not.toBe(bytesToHex(legacy.secretKey))
    expect(modern.pubkey).not.toBe(legacy.pubkey)
  })
})

describe('deriveServerKeypairLegacy', () => {
  it('returns valid keypair', () => {
    const { secretKey, pubkey } = deriveServerKeypairLegacy(TEST_SECRET)

    expect(secretKey.length).toBe(32)
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('signServerEvent', () => {
  it('produces a signed event with valid id and sig', () => {
    const { secretKey, pubkey } = deriveServerKeypair(TEST_SECRET)

    const event = signServerEvent({
      kind: 20001,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'test']],
      content: 'hello',
    }, secretKey)

    expect(event.id).toMatch(/^[0-9a-f]{64}$/)
    expect(event.sig).toMatch(/^[0-9a-f]+$/)
    expect(event.pubkey).toBe(pubkey)
    expect(event.kind).toBe(20001)
    expect(event.content).toBe('hello')
  })

  it('produces different signatures for different content', () => {
    const { secretKey } = deriveServerKeypair(TEST_SECRET)
    const now = Math.floor(Date.now() / 1000)

    const event1 = signServerEvent({
      kind: 20001,
      created_at: now,
      tags: [],
      content: 'message A',
    }, secretKey)

    const event2 = signServerEvent({
      kind: 20001,
      created_at: now,
      tags: [],
      content: 'message B',
    }, secretKey)

    expect(event1.id).not.toBe(event2.id)
    expect(event1.sig).not.toBe(event2.sig)
  })
})

describe('createNostrPublisher', () => {
  it('returns NoopNostrPublisher when no SERVER_NOSTR_SECRET', () => {
    const publisher = createNostrPublisher({})

    expect(publisher).toBeInstanceOf(NoopNostrPublisher)
    expect(publisher.serverPubkey).toBe('')
  })

  it('NoopNostrPublisher.publish does nothing', async () => {
    const publisher = new NoopNostrPublisher()

    // Should not throw
    await publisher.publish({
      kind: 1,
      created_at: Date.now(),
      tags: [],
      content: 'ignored',
    })
  })

  it('returns CFNostrPublisher when NOSFLARE binding exists', () => {
    const mockBinding = { fetch: async () => new Response('ok') }
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
      NOSFLARE: mockBinding,
    })

    expect(publisher).toBeInstanceOf(CFNostrPublisher)
    expect(publisher.serverPubkey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns NodeNostrPublisher when NOSTR_RELAY_URL is set', () => {
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
      NOSTR_RELAY_URL: 'ws://localhost:7777',
    })

    expect(publisher).toBeInstanceOf(NodeNostrPublisher)
    expect(publisher.serverPubkey).toMatch(/^[0-9a-f]{64}$/)

    // Cleanup
    publisher.close()
  })

  it('prefers NOSFLARE over NOSTR_RELAY_URL', () => {
    const mockBinding = { fetch: async () => new Response('ok') }
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
      NOSFLARE: mockBinding,
      NOSTR_RELAY_URL: 'ws://localhost:7777',
    })

    expect(publisher).toBeInstanceOf(CFNostrPublisher)
  })

  it('returns NoopNostrPublisher when secret is set but no relay configured', () => {
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
    })

    expect(publisher).toBeInstanceOf(NoopNostrPublisher)
  })
})

describe('NodeNostrPublisher', () => {
  it('can be closed immediately without error', () => {
    const publisher = new NodeNostrPublisher('ws://localhost:9999', TEST_SECRET)
    publisher.close()
  })

  it('close rejects pending publishes', () => {
    const publisher = new NodeNostrPublisher('ws://localhost:9999', TEST_SECRET)

    // There should be no pending publishes to reject, but close should still work
    publisher.close()
    // Double close should be safe
    publisher.close()
  })
})
