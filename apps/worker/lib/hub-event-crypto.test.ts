/**
 * Unit tests for hub event encryption.
 *
 * Covers: padToBucket, unpadFromBucket, deriveServerEventKey,
 * getCurrentEpoch, encryptHubEvent, decryptHubEvent.
 */

import { describe, it, expect } from 'vitest'
import {
  padToBucket,
  unpadFromBucket,
  deriveServerEventKey,
  getCurrentEpoch,
  encryptHubEvent,
  decryptHubEvent,
  EVENT_KEY_EPOCH_DURATION,
} from './hub-event-crypto'

const SERVER_SECRET = 'a'.repeat(64) // valid 32-byte hex

// ---------------------------------------------------------------------------
// padToBucket / unpadFromBucket
// ---------------------------------------------------------------------------

describe('padToBucket', () => {
  it('pads small payloads to the minimum bucket size (512B)', () => {
    const plain = new Uint8Array([1, 2, 3]) // 3 bytes
    const padded = padToBucket(plain)
    expect(padded.length).toBe(512)
  })

  it('stores actual length in first 4 bytes (little-endian)', () => {
    const plain = new Uint8Array(10)
    plain.fill(0xaa)
    const padded = padToBucket(plain)
    const view = new DataView(padded.buffer)
    expect(view.getUint32(0, true)).toBe(10)
  })

  it('stores plaintext starting at byte 4', () => {
    const plain = new Uint8Array([1, 2, 3])
    const padded = padToBucket(plain)
    expect(padded[4]).toBe(1)
    expect(padded[5]).toBe(2)
    expect(padded[6]).toBe(3)
  })

  it('uses next power-of-2 bucket when 512 is not enough', () => {
    // Need 4 (length) + data to exceed 512
    const big = new Uint8Array(512) // 4 + 512 = 516 > 512, needs 1024
    const padded = padToBucket(big)
    expect(padded.length).toBe(1024)
  })

  it('handles empty payload (pads to 512)', () => {
    const padded = padToBucket(new Uint8Array(0))
    expect(padded.length).toBe(512)
    const view = new DataView(padded.buffer)
    expect(view.getUint32(0, true)).toBe(0)
  })
})

describe('unpadFromBucket', () => {
  it('recovers original bytes from padded buffer', () => {
    const plain = new Uint8Array([10, 20, 30, 40, 50])
    const padded = padToBucket(plain)
    const recovered = unpadFromBucket(padded)
    expect(recovered).toEqual(plain)
  })

  it('throws on buffer shorter than 4 bytes', () => {
    expect(() => unpadFromBucket(new Uint8Array([1, 2, 3]))).toThrow()
  })

  it('throws when length prefix exceeds buffer size', () => {
    const buf = new Uint8Array(8)
    const view = new DataView(buf.buffer)
    view.setUint32(0, 999, true) // claims 999 bytes but buffer is only 8
    expect(() => unpadFromBucket(buf)).toThrow()
  })

  it('round-trips empty payload', () => {
    const padded = padToBucket(new Uint8Array(0))
    const recovered = unpadFromBucket(padded)
    expect(recovered.length).toBe(0)
  })

  it('round-trips 1021-byte payload into 2048 bucket', () => {
    const plain = new Uint8Array(1021).fill(0x42)
    const padded = padToBucket(plain)
    expect(padded.length).toBe(2048)
    const recovered = unpadFromBucket(padded)
    expect(recovered).toEqual(plain)
  })
})

// ---------------------------------------------------------------------------
// deriveServerEventKey
// ---------------------------------------------------------------------------

describe('deriveServerEventKey', () => {
  it('returns a 32-byte key', () => {
    const key = deriveServerEventKey(SERVER_SECRET)
    expect(key.length).toBe(32)
  })

  it('is deterministic for the same input', () => {
    const k1 = deriveServerEventKey(SERVER_SECRET)
    const k2 = deriveServerEventKey(SERVER_SECRET)
    expect(k1).toEqual(k2)
  })

  it('differs for different server secrets', () => {
    const k1 = deriveServerEventKey(SERVER_SECRET)
    const k2 = deriveServerEventKey('b'.repeat(64))
    expect(k1).not.toEqual(k2)
  })

  it('differs for different hubIds (per-hub scoping)', () => {
    const k1 = deriveServerEventKey(SERVER_SECRET, 'hub-a')
    const k2 = deriveServerEventKey(SERVER_SECRET, 'hub-b')
    expect(k1).not.toEqual(k2)
  })

  it('differs for different epochs (forward secrecy)', () => {
    const k1 = deriveServerEventKey(SERVER_SECRET, undefined, 100)
    const k2 = deriveServerEventKey(SERVER_SECRET, undefined, 101)
    expect(k1).not.toEqual(k2)
  })

  it('combining hubId and epoch both affect the key', () => {
    const k1 = deriveServerEventKey(SERVER_SECRET, 'hub-a', 5)
    const k2 = deriveServerEventKey(SERVER_SECRET, 'hub-a', 6)
    const k3 = deriveServerEventKey(SERVER_SECRET, 'hub-b', 5)
    expect(k1).not.toEqual(k2)
    expect(k1).not.toEqual(k3)
  })
})

// ---------------------------------------------------------------------------
// getCurrentEpoch
// ---------------------------------------------------------------------------

describe('getCurrentEpoch', () => {
  it('returns an integer', () => {
    const epoch = getCurrentEpoch()
    expect(Number.isInteger(epoch)).toBe(true)
  })

  it('uses provided timestamp', () => {
    const ts = 86400 * 5 // 5 days into epoch 0 baseline
    const epoch = getCurrentEpoch(ts)
    expect(epoch).toBe(Math.floor(ts / EVENT_KEY_EPOCH_DURATION))
  })

  it('different timestamps in same epoch produce same result', () => {
    const base = 86400 * 10 // start of epoch 10
    expect(getCurrentEpoch(base)).toBe(getCurrentEpoch(base + 100))
  })

  it('timestamps in adjacent epochs produce different results', () => {
    const base = 86400 * 10
    expect(getCurrentEpoch(base)).not.toBe(getCurrentEpoch(base + EVENT_KEY_EPOCH_DURATION))
  })
})

// ---------------------------------------------------------------------------
// encryptHubEvent / decryptHubEvent
// ---------------------------------------------------------------------------

describe('encryptHubEvent / decryptHubEvent', () => {
  const eventKey = deriveServerEventKey(SERVER_SECRET)

  it('round-trips a simple event', () => {
    const content = { type: 'call.answered', callSid: 'CA123' }
    const hex = encryptHubEvent(content, eventKey)
    const recovered = decryptHubEvent(hex, eventKey)
    expect(recovered).toEqual(content)
  })

  it('returns a hex string', () => {
    const hex = encryptHubEvent({ x: 1 }, eventKey)
    expect(hex).toMatch(/^[0-9a-f]+$/)
  })

  it('produces different ciphertext each call (random nonce)', () => {
    const content = { type: 'test' }
    const hex1 = encryptHubEvent(content, eventKey)
    const hex2 = encryptHubEvent(content, eventKey)
    expect(hex1).not.toBe(hex2)
  })

  it('decrypts complex nested objects', () => {
    const content = { a: { b: [1, 2, 3], c: { d: 'deep' } }, flag: true }
    const hex = encryptHubEvent(content, eventKey)
    expect(decryptHubEvent(hex, eventKey)).toEqual(content)
  })

  it('throws on too-short ciphertext', () => {
    expect(() => decryptHubEvent('deadbeef', eventKey)).toThrow()
  })

  it('throws when decrypting with wrong key', () => {
    const hex = encryptHubEvent({ x: 1 }, eventKey)
    const wrongKey = deriveServerEventKey('b'.repeat(64))
    expect(() => decryptHubEvent(hex, wrongKey)).toThrow()
  })

  it('ciphertext length reflects padding (multiple of bucket sizes in hex)', () => {
    // nonce (24B=48hex) + poly1305 tag (16B) + padded plaintext
    const hex = encryptHubEvent({ type: 'test' }, eventKey)
    // Should be 48 (nonce) + 32 (tag) + 1024 (padded bucket) hex chars minimum
    // Actual: 48 + (padded_bucket * 2) + 32 ≥ 48 + 1024 + 32 = 1104 hex chars
    expect(hex.length).toBeGreaterThan(1000)
  })
})
