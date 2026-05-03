import { describe, it, expect } from 'vitest'
import { deriveHubEventKey, deriveServerEventKey, deriveHubEventKeys, encryptHubEvent } from '@worker/lib/hub-event-crypto'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { LABEL_HUB_EVENT, LABEL_HUB_EVENT_KEY } from '@shared/crypto-labels'

// A 64-hex-char (32-byte) test secret, as SERVER_NOSTR_SECRET is defined.
const TEST_SECRET = 'c0ffee00'.repeat(8)

describe('deriveHubEventKey (per-hub)', () => {
  it('returns a 32-byte key', () => {
    const key = deriveHubEventKey(TEST_SECRET, 'hub-1')
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBe(32)
  })

  it('is deterministic — same (secret, hubId) produces same key', () => {
    const key1 = deriveHubEventKey(TEST_SECRET, 'hub-1')
    const key2 = deriveHubEventKey(TEST_SECRET, 'hub-1')
    expect(key1).toEqual(key2)
  })

  it('different hub IDs produce different keys', () => {
    const key1 = deriveHubEventKey(TEST_SECRET, 'hub-1')
    const key2 = deriveHubEventKey(TEST_SECRET, 'hub-2')
    expect(key1).not.toEqual(key2)
  })

  it('different secrets produce different keys for the same hub', () => {
    const key1 = deriveHubEventKey(TEST_SECRET, 'hub-1')
    const key2 = deriveHubEventKey('deadbeef'.repeat(8), 'hub-1')
    expect(key1).not.toEqual(key2)
  })

  it('per-hub key differs from legacy global key', () => {
    const perHub = deriveHubEventKey(TEST_SECRET, 'hub-1')
    const legacy = deriveServerEventKey(TEST_SECRET)
    expect(perHub).not.toEqual(legacy)
  })

  it('empty-string hubId produces a valid key (for cross-hub events)', () => {
    const key = deriveHubEventKey(TEST_SECRET, '')
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBe(32)
  })

  it('uses LABEL_HUB_EVENT_KEY domain separation', () => {
    expect(LABEL_HUB_EVENT_KEY).toBe('llamenos:hub-event-key:v1')
    // The key is derived with LABEL_HUB_EVENT_KEY info, not LABEL_HUB_EVENT
    expect(LABEL_HUB_EVENT_KEY).not.toBe(LABEL_HUB_EVENT)
  })
})

describe('deriveHubEventKeys', () => {
  it('returns a map of hubId to hex key', () => {
    const keys = deriveHubEventKeys(TEST_SECRET, ['hub-1', 'hub-2'])
    expect(Object.keys(keys)).toEqual(['hub-1', 'hub-2'])
    expect(keys['hub-1']).toMatch(/^[0-9a-f]{64}$/)
    expect(keys['hub-2']).toMatch(/^[0-9a-f]{64}$/)
    expect(keys['hub-1']).not.toBe(keys['hub-2'])
  })

  it('includes empty-string key when requested', () => {
    const keys = deriveHubEventKeys(TEST_SECRET, ['', 'hub-1'])
    expect(keys['']).toMatch(/^[0-9a-f]{64}$/)
    expect(keys['hub-1']).toMatch(/^[0-9a-f]{64}$/)
    expect(keys['']).not.toBe(keys['hub-1'])
  })
})

describe('deriveServerEventKey (legacy)', () => {
  it('returns a 32-byte key', () => {
    const key = deriveServerEventKey(TEST_SECRET)
    expect(key).toBeInstanceOf(Uint8Array)
    expect(key.length).toBe(32)
  })

  it('is deterministic — same secret produces same key', () => {
    const key1 = deriveServerEventKey(TEST_SECRET)
    const key2 = deriveServerEventKey(TEST_SECRET)
    expect(key1).toEqual(key2)
  })
})

describe('encryptHubEvent', () => {
  const eventKey = deriveHubEventKey(TEST_SECRET, 'hub-1')

  it('returns a hex string', () => {
    const hex = encryptHubEvent({ type: 'test' }, eventKey)
    expect(hex).toMatch(/^[0-9a-f]+$/)
  })

  it('output is at least 24 bytes nonce + ciphertext with 16-byte tag', () => {
    const hex = encryptHubEvent({ msg: 'hello' }, eventKey)
    // 24-byte nonce + at minimum 1-byte payload + 16-byte Poly1305 tag
    expect(hex.length).toBeGreaterThanOrEqual((24 + 1 + 16) * 2)
  })

  it('produces different ciphertext each call (random nonce)', () => {
    const hex1 = encryptHubEvent({ same: true }, eventKey)
    const hex2 = encryptHubEvent({ same: true }, eventKey)
    expect(hex1).not.toBe(hex2)
  })

  it('round-trips: decrypt recovers original content', () => {
    const content = { eventType: 'call.started', hubId: 'hub-123', ts: 1234567890 }
    const hex = encryptHubEvent(content, eventKey)

    const packed = hexToBytes(hex)
    const nonce = packed.slice(0, 24)
    const ciphertext = packed.slice(24)

    const cipher = xchacha20poly1305(eventKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    const decoded = JSON.parse(new TextDecoder().decode(plaintext))

    expect(decoded).toEqual(content)
  })

  it('wrong key fails to decrypt (authentication tag mismatch)', () => {
    const hex = encryptHubEvent({ secret: 'data' }, eventKey)
    const packed = hexToBytes(hex)
    const nonce = packed.slice(0, 24)
    const ciphertext = packed.slice(24)

    const wrongKey = deriveHubEventKey(TEST_SECRET, 'hub-2')
    const cipher = xchacha20poly1305(wrongKey, nonce)

    expect(() => cipher.decrypt(ciphertext)).toThrow()
  })

  it('hub-1 key cannot decrypt hub-2 encrypted content', () => {
    const hub1Key = deriveHubEventKey(TEST_SECRET, 'hub-1')
    const hub2Key = deriveHubEventKey(TEST_SECRET, 'hub-2')

    const hex = encryptHubEvent({ secret: 'for-hub-2' }, hub2Key)
    const packed = hexToBytes(hex)
    const nonce = packed.slice(0, 24)
    const ciphertext = packed.slice(24)

    const cipher = xchacha20poly1305(hub1Key, nonce)
    expect(() => cipher.decrypt(ciphertext)).toThrow()
  })
})
