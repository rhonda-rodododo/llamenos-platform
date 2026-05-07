/**
 * Two-tier HPKE push payload encryption (Epic 86).
 *
 * Wake tier: encrypted with device-specific wake key — decryptable without PIN.
 * Full tier: encrypted with user's X25519 pubkey — decryptable only after PIN unlock.
 */

import { hpkeSeal } from '@llamenos/crypto/ffi'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_PUSH_WAKE, LABEL_PUSH_FULL } from '@shared/crypto-labels'
import type { WakePayload, FullPushPayload } from '../types'

/**
 * HPKE encrypt a payload for a single recipient pubkey with domain separation.
 * Returns hex-encoded: enc(32) || ciphertext+tag.
 */
function hpkeEncryptPayload(plaintext: string, recipientPubkeyHex: string, label: string): string {
  const labelBytes = utf8ToBytes(label)
  const aad = utf8ToBytes(`${label}:push`)
  const sealed = hpkeSeal(hexToBytes(recipientPubkeyHex), utf8ToBytes(plaintext), labelBytes, aad)
  return bytesToHex(sealed)
}

/**
 * Encrypt wake-tier push payload for a specific device.
 * Uses the device's wake key — accessible without user's PIN.
 */
export function encryptWakePayload(payload: WakePayload, deviceWakeKeyPublic: string): string {
  return hpkeEncryptPayload(JSON.stringify(payload), deviceWakeKeyPublic, LABEL_PUSH_WAKE)
}

/**
 * Encrypt full-tier push payload for a user's identity.
 * Requires the user's private key (PIN unlock) to decrypt.
 */
export function encryptFullPayload(payload: FullPushPayload, userPubkey: string): string {
  return hpkeEncryptPayload(JSON.stringify(payload), userPubkey, LABEL_PUSH_FULL)
}
