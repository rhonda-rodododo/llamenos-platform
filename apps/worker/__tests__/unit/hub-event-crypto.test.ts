import { describe, it, expect } from 'vitest'
import {
  deriveServerEventKey,
  encryptHubEvent,
  getCurrentEpoch,
  EVENT_KEY_EPOCH_DURATION,
} from '@worker/lib/hub-event-crypto'
import { deriveServerKeypair, deriveServerKeypairLegacy } from '@worker/lib/nostr-publisher'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

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

  it('epoch-derived key can round-trip decrypt', () => {
    const epoch = getCurrentEpoch()
    const epochKey = deriveServerEventKey(TEST_SECRET, undefined, epoch)
    const content = { type: 'epoch-test', epoch }
    const hex = encryptHubEvent(content, epochKey)

    // Decrypt with same epoch key
    const packed = hexToBytes(hex)
    const nonce = packed.slice(0, 24)
    const ciphertext = packed.slice(24)
    const cipher = xchacha20poly1305(epochKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    const decoded = JSON.parse(new TextDecoder().decode(plaintext))

    expect(decoded).toEqual(content)

    // Decrypt with different epoch key fails
    const wrongEpochKey = deriveServerEventKey(TEST_SECRET, undefined, epoch + 1)
    const wrongCipher = xchacha20poly1305(wrongEpochKey, nonce)
    expect(() => wrongCipher.decrypt(ciphertext)).toThrow()
  })
})
