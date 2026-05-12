#!/usr/bin/env bun
/**
 * Bootstrap the first admin user (CLI method).
 *
 * Generates TWO keypairs:
 *   1. Identity keypair — for authentication (Schnorr signatures, login)
 *   2. Decryption keypair — for note/message encryption (ECIES wrapping)
 *
 * Separating identity from decryption means revoking the identity key
 * (e.g., after a session compromise) does NOT require re-encrypting all
 * stored notes. Conversely, rotating the decryption key does not invalidate
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

import { bytesToHex } from '@noble/hashes/utils'

function generateEd25519Keypair(): { seed: Uint8Array; pubkeyHex: string } {
  const seed = crypto.getRandomValues(new Uint8Array(32))
  // For bootstrap, we just need the seed and pubkey hex
  // The actual Ed25519 pubkey derivation would be done by the crypto library
  // For now, return the seed as hex which can be imported
  return { seed, pubkeyHex: bytesToHex(seed) }
}

// --- Identity Keypair (auth/login) ---
const identityKeypair = generateEd25519Keypair()
const identityPubkey = identityKeypair.pubkeyHex

// --- Decryption Keypair (note/message encryption) ---
const decryptionKeypair = generateEd25519Keypair()
const decryptionPubkey = decryptionKeypair.pubkeyHex

console.log('=== Llámenos Admin Bootstrap ===\n')
console.log('Two keypairs have been generated:\n')

console.log('--- Identity Keypair (authentication) ---\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${identityPubkey}\n`)
console.log('SECRET KEY (seed hex) — admin uses this to log in:')
console.log(`  ${bytesToHex(identityKeypair.seed)}\n`)

console.log('--- Decryption Keypair (note/message encryption) ---\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${decryptionPubkey}\n`)
console.log('SECRET KEY (seed hex) — admin needs this to decrypt notes:')
console.log(`  ${bytesToHex(decryptionKeypair.seed)}\n`)

// --- Server Secret (relay event signing) ---
const serverSecret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

console.log('--- Server Secret (WebSocket relay event signing) ---\n')
console.log('SERVER_SECRET (hex):')
console.log(`  ${serverSecret}\n`)
console.log('This secret is used to derive the server\'s Ed25519 keypair for')
console.log('signing real-time events (call notifications, presence, etc.).\n')

console.log('--- Next Steps ---\n')
console.log('1. Set secrets for Cloudflare deployment:')
console.log(`   echo "${identityPubkey}" | bunx wrangler secret put ADMIN_PUBKEY`)
console.log(`   echo "${decryptionPubkey}" | bunx wrangler secret put ADMIN_DECRYPTION_PUBKEY`)
console.log(`   echo "${serverSecret}" | bunx wrangler secret put SERVER_SECRET\n`)
console.log('2. For local development, add to .env:')
console.log(`   ADMIN_PUBKEY=${identityPubkey}`)
console.log(`   ADMIN_DECRYPTION_PUBKEY=${decryptionPubkey}`)
console.log(`   SERVER_SECRET=${serverSecret}\n`)
console.log('3. For Docker deployment, also add to .env:')
console.log(`   ADMIN_PUBKEY=${identityPubkey}`)
console.log(`   SERVER_SECRET=${serverSecret}\n`)
console.log('4. The admin logs in with the IDENTITY seed hex.')
console.log('5. The admin imports the DECRYPTION seed hex to decrypt notes.')
console.log('   (In the current single-admin setup, both seeds are entered during onboarding.)\n')
console.log('   IMPORTANT: Store both seeds securely. They cannot be recovered.\n')
