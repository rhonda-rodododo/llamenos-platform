/**
 * Unit tests for apps/worker/lib/agent-identity.ts
 *
 * Tests agent keypair generation, sealing, and unsealing.
 * Bug-hunting focus: key isolation, domain separation, zeroization.
 */
import { describe, it, expect } from 'bun:test'
import { generateAgentKeypair, unsealAgentNsec } from '@worker/lib/agent-identity'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

// A valid 32-byte hex seal key
const SEAL_KEY = 'a'.repeat(64)
const SEAL_LABEL = 'llamenos:agent-seal'

describe('agent-identity', () => {
  describe('generateAgentKeypair', () => {
    it('generates a valid secp256k1 keypair', () => {
      const { pubkey, encryptedNsec } = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)

      // Pubkey should be 64 hex chars (32 bytes x-only)
      expect(pubkey).toMatch(/^[0-9a-f]{64}$/)
      // Encrypted nsec should be non-empty hex
      expect(encryptedNsec).toMatch(/^[0-9a-f]+$/)
      // Encrypted nsec = 24 byte nonce + (32 byte nsec hex = 64 chars = 64 bytes + 16 byte tag)
      // nonce(24) + ciphertext(64+16=80) = 104 bytes = 208 hex chars
      expect(encryptedNsec.length).toBe(208)
    })

    it('generates different keypairs for different agentIds', () => {
      const kp1 = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)
      const kp2 = generateAgentKeypair('agent-2', SEAL_KEY, SEAL_LABEL)

      expect(kp1.pubkey).not.toBe(kp2.pubkey)
      expect(kp1.encryptedNsec).not.toBe(kp2.encryptedNsec)
    })

    it('generates different keypairs on each call (random)', () => {
      const kp1 = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)
      const kp2 = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)

      // Random nsec means different pubkeys each time
      expect(kp1.pubkey).not.toBe(kp2.pubkey)
    })

    it('pubkey is valid for Schnorr verification', () => {
      const { pubkey } = generateAgentKeypair('agent-test', SEAL_KEY, SEAL_LABEL)
      // Should not throw when used as a public key
      const point = schnorr.utils.lift_x(BigInt('0x' + pubkey))
      expect(point).toBeDefined()
    })
  })

  describe('unsealAgentNsec', () => {
    it('round-trips: seal then unseal recovers nsec that matches pubkey', () => {
      const { pubkey, encryptedNsec } = generateAgentKeypair('agent-rt', SEAL_KEY, SEAL_LABEL)
      const nsecHex = unsealAgentNsec('agent-rt', encryptedNsec, SEAL_KEY, SEAL_LABEL)

      // nsec should be 64 hex chars (32 bytes)
      expect(nsecHex).toMatch(/^[0-9a-f]{64}$/)

      // Derive pubkey from recovered nsec to verify it matches
      const recoveredPubkey = bytesToHex(schnorr.getPublicKey(hexToBytes(nsecHex)))
      expect(recoveredPubkey).toBe(pubkey)
    })

    it('fails with wrong agentId (key isolation)', () => {
      const { encryptedNsec } = generateAgentKeypair('agent-a', SEAL_KEY, SEAL_LABEL)

      expect(() => {
        unsealAgentNsec('agent-b', encryptedNsec, SEAL_KEY, SEAL_LABEL)
      }).toThrow()
    })

    it('fails with wrong seal key', () => {
      const { encryptedNsec } = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)
      const wrongKey = 'b'.repeat(64)

      expect(() => {
        unsealAgentNsec('agent-1', encryptedNsec, wrongKey, SEAL_LABEL)
      }).toThrow()
    })

    it('fails with wrong seal label (domain separation)', () => {
      const { encryptedNsec } = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)

      expect(() => {
        unsealAgentNsec('agent-1', encryptedNsec, SEAL_KEY, 'wrong-label')
      }).toThrow()
    })

    it('fails with tampered ciphertext', () => {
      const { encryptedNsec } = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)
      // Flip a byte in the middle of the ciphertext (after the 48 char nonce)
      const tampered = encryptedNsec.slice(0, 60) + 'ff' + encryptedNsec.slice(62)

      expect(() => {
        unsealAgentNsec('agent-1', tampered, SEAL_KEY, SEAL_LABEL)
      }).toThrow()
    })
  })
})
