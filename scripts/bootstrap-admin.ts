#!/usr/bin/env bun
/**
 * Bootstrap the first admin user (CLI method).
 *
 * Generates TWO keypairs:
 *   1. Identity keypair — Ed25519 for authentication (signatures, login)
 *   2. Encryption keypair — X25519 for note/message encryption (HPKE wrapping)
 *
 * Separating identity from encryption means revoking the identity key
 * (e.g., after a session compromise) does NOT require re-encrypting all
 * stored notes. Conversely, rotating the encryption key does not invalidate
 * active sessions.
 *
 * NOTE: The recommended approach is in-browser bootstrap — simply visit
 * your deployed app and the setup wizard will generate a keypair for you.
 * This CLI script is useful for headless/CI setups where browser access
 * is not available.
 *
 * Usage:
 *   bun run scripts/bootstrap-admin.ts
 */

import { randomBytes, ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'
import { bytesToHex } from '@shared/encoding'

// --- Identity Keypair (Ed25519 auth/login) ---
const identitySeed = randomBytes(32)
const identityPubkey = bytesToHex(ed25519PubkeyFromSeed(identitySeed))
const identitySeedHex = bytesToHex(identitySeed)

// --- Encryption Keypair (X25519 for HPKE envelope encryption) ---
const encryptionSeed = randomBytes(32)
const encryptionPubkey = bytesToHex(ed25519PubkeyFromSeed(encryptionSeed))
const encryptionSeedHex = bytesToHex(encryptionSeed)

// --- Server Secret (relay event signing + HMAC operations) ---
const serverSecret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

console.log('=== Llámenos Admin Bootstrap ===\n')
console.log('Two keypairs have been generated:\n')

console.log('--- Identity Keypair (Ed25519 authentication) ---\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${identityPubkey}\n`)
console.log('SECRET SEED (hex) — admin uses this to log in:')
console.log(`  ${identitySeedHex}\n`)

console.log('--- Encryption Keypair (HPKE note/message encryption) ---\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${encryptionPubkey}\n`)
console.log('SECRET SEED (hex) — admin needs this to decrypt notes:')
console.log(`  ${encryptionSeedHex}\n`)

console.log('--- Server Secret (relay signing + HMAC) ---\n')
console.log('SERVER_SECRET (hex):')
console.log(`  ${serverSecret}\n`)

console.log('--- Next Steps ---\n')
console.log('1. For local development, add to .env:')
console.log(`   ADMIN_PUBKEY=${identityPubkey}`)
console.log(`   ADMIN_ENCRYPTION_PUBKEY=${encryptionPubkey}`)
console.log(`   SERVER_SECRET=${serverSecret}\n`)
console.log('2. For Docker deployment, add the same vars to .env\n')
console.log('3. The admin logs in with the IDENTITY seed hex.')
console.log('4. The admin imports the ENCRYPTION seed hex to decrypt notes.')
console.log('   (In the current single-admin setup, both seeds are entered during onboarding.)\n')
console.log('   IMPORTANT: Store both seeds securely. They cannot be recovered.\n')
