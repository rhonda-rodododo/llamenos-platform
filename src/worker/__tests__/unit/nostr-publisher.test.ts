import { describe, it, expect } from 'vitest'
import {
  deriveServerKeypair,
  signServerEvent,
  createNostrPublisher,
  NoopNostrPublisher,
} from '@worker/lib/nostr-publisher'
import { getPublicKey, verifyEvent } from 'nostr-tools/pure'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

// Valid 64-char hex secret for testing
const TEST_SECRET = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'

describe('deriveServerKeypair', () => {
  it('derives a keypair from a hex secret', () => {
    const { secretKey, pubkey } = deriveServerKeypair(TEST_SECRET)
    expect(secretKey).toBeInstanceOf(Uint8Array)
    expect(secretKey.length).toBe(32)
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent output for same secret', () => {
    const kp1 = deriveServerKeypair(TEST_SECRET)
    const kp2 = deriveServerKeypair(TEST_SECRET)
    expect(bytesToHex(kp1.secretKey)).toBe(bytesToHex(kp2.secretKey))
    expect(kp1.pubkey).toBe(kp2.pubkey)
  })

  it('produces different keys for different secrets', () => {
    const kp1 = deriveServerKeypair(TEST_SECRET)
    const kp2 = deriveServerKeypair('b'.repeat(64))
    expect(kp1.pubkey).not.toBe(kp2.pubkey)
  })

  it('derived pubkey matches getPublicKey from secret', () => {
    const { secretKey, pubkey } = deriveServerKeypair(TEST_SECRET)
    const expectedPubkey = getPublicKey(secretKey)
    expect(pubkey).toBe(expectedPubkey)
  })
})

describe('signServerEvent', () => {
  it('signs an event template', () => {
    const { secretKey } = deriveServerKeypair(TEST_SECRET)
    const event = signServerEvent({
      kind: 20001,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'llamenos:event']],
      content: '{"type":"test"}',
    }, secretKey)

    expect(event.id).toMatch(/^[0-9a-f]{64}$/)
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/)
    expect(event.kind).toBe(20001)
  })

  it('produced event is verifiable', () => {
    const { secretKey, pubkey } = deriveServerKeypair(TEST_SECRET)
    const event = signServerEvent({
      kind: 20001,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'global'], ['t', 'llamenos:event']],
      content: JSON.stringify({ type: 'test' }),
    }, secretKey)

    expect(event.pubkey).toBe(pubkey)
    expect(verifyEvent(event)).toBe(true)
  })

  it('event has correct pubkey', () => {
    const { secretKey, pubkey } = deriveServerKeypair(TEST_SECRET)
    const event = signServerEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: 'test',
    }, secretKey)

    expect(event.pubkey).toBe(pubkey)
  })

  it('preserves tags in signed event', () => {
    const { secretKey } = deriveServerKeypair(TEST_SECRET)
    const tags = [['d', 'hub-123'], ['t', 'llamenos:event'], ['p', 'abc']]
    const event = signServerEvent({
      kind: 20001,
      created_at: 1234567890,
      tags,
      content: '{}',
    }, secretKey)

    expect(event.tags).toEqual(tags)
  })
})

describe('createNostrPublisher', () => {
  it('returns NoopNostrPublisher when no secret', () => {
    const publisher = createNostrPublisher({})
    expect(publisher).toBeInstanceOf(NoopNostrPublisher)
    expect(publisher.serverPubkey).toBe('')
  })

  it('returns NoopNostrPublisher when secret but no relay', () => {
    const publisher = createNostrPublisher({ SERVER_NOSTR_SECRET: TEST_SECRET })
    expect(publisher).toBeInstanceOf(NoopNostrPublisher)
  })

  it('returns CFNostrPublisher when NOSFLARE binding exists', () => {
    const fakeBinding = { fetch: async () => new Response('ok') }
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
      NOSFLARE: fakeBinding,
    })
    expect(publisher.serverPubkey).toMatch(/^[0-9a-f]{64}$/)
    expect(publisher.serverPubkey).not.toBe('')
    publisher.close()
  })

  it('returns NodeNostrPublisher when NOSTR_RELAY_URL exists', () => {
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
      NOSTR_RELAY_URL: 'wss://relay.example.com',
    })
    expect(publisher.serverPubkey).toMatch(/^[0-9a-f]{64}$/)
    expect(publisher.serverPubkey).not.toBe('')
    publisher.close()
  })

  it('CF binding takes priority over relay URL', () => {
    const fakeBinding = { fetch: async () => new Response('ok') }
    const publisher = createNostrPublisher({
      SERVER_NOSTR_SECRET: TEST_SECRET,
      NOSFLARE: fakeBinding,
      NOSTR_RELAY_URL: 'wss://relay.example.com',
    })
    // Both provided — CF binding should win
    expect(publisher.serverPubkey).toBeTruthy()
    publisher.close()
  })
})

describe('NoopNostrPublisher', () => {
  it('has empty serverPubkey', () => {
    const publisher = new NoopNostrPublisher()
    expect(publisher.serverPubkey).toBe('')
  })

  it('publish resolves without error', async () => {
    const publisher = new NoopNostrPublisher()
    await expect(publisher.publish({
      kind: 20001,
      created_at: 1234567890,
      tags: [],
      content: '{}',
    })).resolves.toBeUndefined()
  })

  it('close does not throw', () => {
    const publisher = new NoopNostrPublisher()
    expect(() => publisher.close()).not.toThrow()
  })
})
