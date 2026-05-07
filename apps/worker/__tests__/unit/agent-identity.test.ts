/**
 * Unit tests for apps/worker/lib/agent-identity.ts
 *
 * Tests agent keypair generation, sealing, and unsealing.
 * Bug-hunting focus: key isolation, domain separation, zeroization.
 */
import { describe, it, expect } from 'vitest'
import { generateAgentKeypair, unsealAgentNsec } from '@worker/lib/agent-identity'
import { ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'
import { bytesToHex, hexToBytes } from '@shared/encoding'

// A valid 32-byte hex seal key
const SEAL_KEY = 'a'.repeat(64)
const SEAL_LABEL = 'llamenos:agent-seal'

describe('agent-identity', () => {
  describe('generateAgentKeypair', () => {
    it('generates a valid Ed25519 keypair', () => {
      const { pubkey, encryptedNsec } = generateAgentKeypair('agent-1', SEAL_KEY, SEAL_LABEL)

      // Pubkey should be 64 hex chars (32 bytes x-only)
      expect(pubkey).toMatch(/^[0-9a-f]{64}$/)
      // Encrypted nsec should be non-empty hex
      expect(encryptedNsec).toMatch(/^[0-9a-f]+$/)
      // AES-256-GCM: 12 byte nonce + (64 byte nsec-hex plaintext + 16 byte tag = 80 bytes)
      // nonce(12) + ciphertext(80) = 92 bytes = 184 hex chars
      expect(encryptedNsec.length).toBe(184)
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

    it('pubkey is a valid Ed25519 public key', () => {
      const { pubkey } = generateAgentKeypair('agent-test', SEAL_KEY, SEAL_LABEL)
      // Should be 64 hex chars (32 bytes) — valid Ed25519 pubkey
      expect(pubkey).toMatch(/^[0-9a-f]{64}$/)
      expect(hexToBytes(pubkey).length).toBe(32)
    })
  })

  describe('unsealAgentNsec', () => {
    it('round-trips: seal then unseal recovers nsec that matches pubkey', () => {
      const { pubkey, encryptedNsec } = generateAgentKeypair('agent-rt', SEAL_KEY, SEAL_LABEL)
      const nsecHex = unsealAgentNsec('agent-rt', encryptedNsec, SEAL_KEY, SEAL_LABEL)

      // nsec should be 64 hex chars (32 bytes)
      expect(nsecHex).toMatch(/^[0-9a-f]{64}$/)

      // Derive pubkey from recovered seed to verify it matches
      const recoveredPubkey = bytesToHex(ed25519PubkeyFromSeed(hexToBytes(nsecHex)))
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
