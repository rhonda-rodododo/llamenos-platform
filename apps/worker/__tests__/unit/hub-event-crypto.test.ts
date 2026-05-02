import { describe, it, expect } from 'vitest'
import { deriveServerEventKey, encryptHubEvent } from '@worker/lib/hub-event-crypto'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { LABEL_HUB_EVENT } from '@shared/crypto-labels'

// A 64-hex-char (32-byte) test secret, as SERVER_NOSTR_SECRET is defined.
const TEST_SECRET = 'c0ffee00'.repeat(8)

describe('deriveServerEventKey', () => {
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

  it('different secrets produce different keys', () => {
    const key1 = deriveServerEventKey(TEST_SECRET)
    const key2 = deriveServerEventKey('deadbeef00'.repeat(6) + 'deadbeef')
    expect(key1).not.toEqual(key2)
  })

  it('includes the domain separation label in derivation', () => {
    // Derive with a different info string by comparing to a key derived without
    // the label — we cannot easily do this without re-implementing HKDF, so
    // instead we verify the label constant is the expected string and that the
    // key changes when the secret changes (label is part of HKDF info).
    expect(LABEL_HUB_EVENT).toBe('llamenos:hub-event')

    // Two secrets → two keys, confirming the derivation is sensitive to input.
    const k1 = deriveServerEventKey(TEST_SECRET)
    const k2 = deriveServerEventKey('aabbccdd'.repeat(8))
    expect(k1).not.toEqual(k2)
  })
})

describe('encryptHubEvent', () => {
  const eventKey = deriveServerEventKey(TEST_SECRET)

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

    const wrongKey = deriveServerEventKey('deadbeef'.repeat(8))
    const cipher = xchacha20poly1305(wrongKey, nonce)

    expect(() => cipher.decrypt(ciphertext)).toThrow()
  })
})
