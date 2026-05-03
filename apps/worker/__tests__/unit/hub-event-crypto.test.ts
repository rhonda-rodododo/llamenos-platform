import { describe, it, expect } from 'vitest'
import {
  deriveServerEventKey,
  encryptHubEvent,
  decryptHubEvent,
  getCurrentEpoch,
  EVENT_KEY_EPOCH_DURATION,
  padToBucket,
  unpadFromBucket,
} from '@worker/lib/hub-event-crypto'
import { deriveServerKeypair, deriveServerKeypairLegacy } from '@worker/lib/nostr-publisher'
import { bytesToHex } from '@noble/hashes/utils.js'

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
})

describe('H1: Signing / encryption key separation', () => {
  it('signing key and encryption key are derived independently', () => {
    const signingKeypair = deriveServerKeypair(TEST_SECRET)
    const encryptionKey = deriveServerEventKey(TEST_SECRET)

    // The signing secret key (32 bytes) must differ from the encryption key (32 bytes)
    expect(bytesToHex(signingKeypair.secretKey)).not.toBe(bytesToHex(encryptionKey))
  })

  it('new signing key differs from legacy signing key', () => {
    const newKeypair = deriveServerKeypair(TEST_SECRET)
    const legacyKeypair = deriveServerKeypairLegacy(TEST_SECRET)

    expect(newKeypair.pubkey).not.toBe(legacyKeypair.pubkey)
    expect(bytesToHex(newKeypair.secretKey)).not.toBe(bytesToHex(legacyKeypair.secretKey))
  })

  it('encryption key is deterministic for same inputs', () => {
    const key1 = deriveServerEventKey(TEST_SECRET)
    const key2 = deriveServerEventKey(TEST_SECRET)
    expect(bytesToHex(key1)).toBe(bytesToHex(key2))
  })

  it('different secrets produce different encryption keys', () => {
    const key1 = deriveServerEventKey(TEST_SECRET)
    const key2 = deriveServerEventKey('b'.repeat(64))
    expect(bytesToHex(key1)).not.toBe(bytesToHex(key2))
  })
})

describe('H5: Epoch-based key rotation', () => {
  it('getCurrentEpoch returns a positive integer', () => {
    const epoch = getCurrentEpoch()
    expect(epoch).toBeGreaterThan(0)
    expect(Number.isInteger(epoch)).toBe(true)
  })

  it('getCurrentEpoch is deterministic for same timestamp', () => {
    const ts = 1700000000
    expect(getCurrentEpoch(ts)).toBe(getCurrentEpoch(ts))
  })

  it('timestamps within same epoch produce same epoch number', () => {
    // Use a timestamp aligned to an epoch boundary to avoid off-by-one
    const epochNum = 19675 // arbitrary epoch
    const baseTs = epochNum * EVENT_KEY_EPOCH_DURATION
    const epoch1 = getCurrentEpoch(baseTs)
    const epoch2 = getCurrentEpoch(baseTs + EVENT_KEY_EPOCH_DURATION - 1)
    expect(epoch1).toBe(epoch2)
    expect(epoch1).toBe(epochNum)
  })

  it('timestamps in adjacent epochs produce different epoch numbers', () => {
    const baseTs = 1700000000
    const epoch1 = getCurrentEpoch(baseTs)
    const epoch2 = getCurrentEpoch(baseTs + EVENT_KEY_EPOCH_DURATION)
    expect(epoch2).toBe(epoch1 + 1)
  })

  it('different epochs produce different encryption keys', () => {
    const key1 = deriveServerEventKey(TEST_SECRET, undefined, 100)
    const key2 = deriveServerEventKey(TEST_SECRET, undefined, 101)
    expect(bytesToHex(key1)).not.toBe(bytesToHex(key2))
  })

  it('same epoch produces same encryption key', () => {
    const key1 = deriveServerEventKey(TEST_SECRET, undefined, 100)
    const key2 = deriveServerEventKey(TEST_SECRET, undefined, 100)
    expect(bytesToHex(key1)).toBe(bytesToHex(key2))
  })

  it('per-hub keys are different from global keys', () => {
    const globalKey = deriveServerEventKey(TEST_SECRET, undefined, 100)
    const hubKey = deriveServerEventKey(TEST_SECRET, 'hub-123', 100)
    expect(bytesToHex(globalKey)).not.toBe(bytesToHex(hubKey))
  })

  it('different hubs produce different keys at same epoch', () => {
    const hubKey1 = deriveServerEventKey(TEST_SECRET, 'hub-1', 100)
    const hubKey2 = deriveServerEventKey(TEST_SECRET, 'hub-2', 100)
    expect(bytesToHex(hubKey1)).not.toBe(bytesToHex(hubKey2))
  })

  it('EVENT_KEY_EPOCH_DURATION is 24 hours', () => {
    expect(EVENT_KEY_EPOCH_DURATION).toBe(86400)
  })
})

describe('padToBucket', () => {
  it('empty input pads to 512-byte bucket', () => {
    const result = padToBucket(new Uint8Array(0))
    expect(result.length).toBe(512)
  })

  it('1-byte input pads to 512-byte bucket', () => {
    const result = padToBucket(new Uint8Array([0x42]))
    expect(result.length).toBe(512)
  })

  it('507-byte input (4+507=511) pads to 512-byte bucket', () => {
    const result = padToBucket(new Uint8Array(507))
    expect(result.length).toBe(512)
  })

  it('508-byte input (4+508=512) pads to 512-byte bucket exactly', () => {
    const result = padToBucket(new Uint8Array(508))
    expect(result.length).toBe(512)
  })

  it('509-byte input (4+509=513) pads to 1024-byte bucket', () => {
    const result = padToBucket(new Uint8Array(509))
    expect(result.length).toBe(1024)
  })

  it('1020-byte input (4+1020=1024) pads to 1024-byte bucket exactly', () => {
    const result = padToBucket(new Uint8Array(1020))
    expect(result.length).toBe(1024)
  })

  it('1021-byte input (4+1021=1025) pads to 2048-byte bucket', () => {
    const result = padToBucket(new Uint8Array(1021))
    expect(result.length).toBe(2048)
  })

  it('4092-byte input pads to 4096-byte bucket', () => {
    const result = padToBucket(new Uint8Array(4092))
    expect(result.length).toBe(4096)
  })

  it('4093-byte input (4+4093=4097) pads to 8192-byte bucket', () => {
    const result = padToBucket(new Uint8Array(4093))
    expect(result.length).toBe(8192)
  })

  it('length prefix encodes actual plaintext length in little-endian', () => {
    const plaintext = new Uint8Array([0x01, 0x02, 0x03])
    const padded = padToBucket(plaintext)
    const view = new DataView(padded.buffer)
    expect(view.getUint32(0, true)).toBe(3) // 3 bytes, LE
  })

  it('plaintext bytes appear at offset 4 in padded output', () => {
    const plaintext = new Uint8Array([0xAA, 0xBB, 0xCC])
    const padded = padToBucket(plaintext)
    expect(padded[4]).toBe(0xAA)
    expect(padded[5]).toBe(0xBB)
    expect(padded[6]).toBe(0xCC)
  })

  it('padding bytes beyond plaintext are random — not all zeros', () => {
    // Statistically: probability all 500 bytes are zero is astronomically low
    const plaintext = new Uint8Array(4) // 4+4=8, padded to 512
    const padded = padToBucket(plaintext)
    const paddingBytes = padded.slice(8)
    const allZero = paddingBytes.every(b => b === 0)
    expect(allZero).toBe(false)
  })

  it('two calls produce different padding bytes for the same input', () => {
    const plaintext = new Uint8Array([0x01])
    const padded1 = padToBucket(plaintext)
    const padded2 = padToBucket(plaintext)
    // The length prefix and plaintext bytes are identical; padding region differs
    expect(padded1.slice(5)).not.toEqual(padded2.slice(5))
  })
})

describe('unpadFromBucket', () => {
  it('roundtrip: padToBucket → unpadFromBucket = original', () => {
    const original = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05])
    const padded = padToBucket(original)
    const recovered = unpadFromBucket(padded)
    expect(recovered).toEqual(original)
  })

  it('roundtrip for empty input', () => {
    const original = new Uint8Array(0)
    const padded = padToBucket(original)
    const recovered = unpadFromBucket(padded)
    expect(recovered).toEqual(original)
  })

  it('roundtrip for large input (8192-byte bucket)', () => {
    const original = new Uint8Array(5000).fill(0x7F)
    const padded = padToBucket(original)
    expect(padded.length).toBe(8192)
    const recovered = unpadFromBucket(padded)
    expect(recovered).toEqual(original)
  })

  it('throws on buffer shorter than 4 bytes', () => {
    expect(() => unpadFromBucket(new Uint8Array(3))).toThrow()
  })

  it('throws when length prefix exceeds buffer size', () => {
    const bad = new Uint8Array(8)
    const view = new DataView(bad.buffer)
    view.setUint32(0, 9999, true) // claims 9999 bytes but buffer is only 8
    expect(() => unpadFromBucket(bad)).toThrow()
  })
})

describe('encryptHubEvent', () => {
  const eventKey = deriveServerEventKey(TEST_SECRET)

  it('returns a hex string', () => {
    const hex = encryptHubEvent({ type: 'test' }, eventKey)
    expect(hex).toMatch(/^[0-9a-f]+$/)
  })

  it('output is at least 24 bytes nonce + 512-byte padded ciphertext + 16-byte tag', () => {
    const hex = encryptHubEvent({ msg: 'hello' }, eventKey)
    // 24-byte nonce + 512-byte padded payload + 16-byte Poly1305 tag
    expect(hex.length / 2).toBeGreaterThanOrEqual(24 + 512 + 16)
  })

  it('produces different ciphertext each call (random nonce + random padding)', () => {
    const hex1 = encryptHubEvent({ same: true }, eventKey)
    const hex2 = encryptHubEvent({ same: true }, eventKey)
    expect(hex1).not.toBe(hex2)
  })

  it('ciphertext length is consistent for same-bucket payloads', () => {
    // Two small payloads that both fit in the 512-byte bucket produce same-length output
    const hex1 = encryptHubEvent({ a: 1 }, eventKey)
    const hex2 = encryptHubEvent({ type: 'call.started', hubId: 'hub-123', ts: 1234567890 }, eventKey)
    expect(hex1.length).toBe(hex2.length)
  })
})

describe('decryptHubEvent', () => {
  const eventKey = deriveServerEventKey(TEST_SECRET)

  it('roundtrip: encryptHubEvent → decryptHubEvent = original', () => {
    const content = { eventType: 'call.started', hubId: 'hub-123', ts: 1234567890 }
    const hex = encryptHubEvent(content, eventKey)
    const decoded = decryptHubEvent(hex, eventKey)
    expect(decoded).toEqual(content)
  })

  it('roundtrip for minimal payload', () => {
    const content = { x: 1 }
    expect(decryptHubEvent(encryptHubEvent(content, eventKey), eventKey)).toEqual(content)
  })

  it('roundtrip for large payload (crosses bucket boundary)', () => {
    // Build a payload that's larger than 512B JSON
    const content: Record<string, unknown> = {}
    for (let i = 0; i < 50; i++) content[`field_${i}`] = 'value_'.repeat(5)
    const hex = encryptHubEvent(content, eventKey)
    const decoded = decryptHubEvent(hex, eventKey)
    expect(decoded).toEqual(content)
  })

  it('throws on wrong key (authentication failure)', () => {
    const hex = encryptHubEvent({ secret: 'data' }, eventKey)
    const wrongKey = deriveServerEventKey('deadbeef'.repeat(8))
    expect(() => decryptHubEvent(hex, wrongKey)).toThrow()
  })

  it('throws on ciphertext too short', () => {
    expect(() => decryptHubEvent('deadbeef', eventKey)).toThrow()
  })

  it('epoch-derived key can round-trip decrypt', () => {
    const epoch = getCurrentEpoch()
    const epochKey = deriveServerEventKey(TEST_SECRET, undefined, epoch)
    const content = { type: 'epoch-test', epoch }
    const hex = encryptHubEvent(content, epochKey)
    const decoded = decryptHubEvent(hex, epochKey)
    expect(decoded).toEqual(content)

    // Decrypt with different epoch key fails
    const wrongEpochKey = deriveServerEventKey(TEST_SECRET, undefined, epoch + 1)
    expect(() => decryptHubEvent(hex, wrongEpochKey)).toThrow()
  })

  it('hub-scoped key cannot decrypt global-scoped content', () => {
    const globalKey = deriveServerEventKey(TEST_SECRET, undefined, 100)
    const hubKey = deriveServerEventKey(TEST_SECRET, 'hub-1', 100)
    const hex = encryptHubEvent({ secret: 'global' }, globalKey)
    expect(() => decryptHubEvent(hex, hubKey)).toThrow()
  })
})
