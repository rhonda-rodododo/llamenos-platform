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

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils'

// --- Identity Keypair (auth/login) ---
const identitySecret = generateSecretKey()
const identityPubkey = getPublicKey(identitySecret)
const identityNsec = nip19.nsecEncode(identitySecret)
const identityNpub = nip19.npubEncode(identityPubkey)

// --- Decryption Keypair (note/message encryption) ---
const decryptionSecret = generateSecretKey()
const decryptionPubkey = getPublicKey(decryptionSecret)
const decryptionNsec = nip19.nsecEncode(decryptionSecret)
const decryptionNpub = nip19.npubEncode(decryptionPubkey)

console.log('=== Llámenos Admin Bootstrap ===\n')
console.log('Two keypairs have been generated:\n')

console.log('--- Identity Keypair (authentication) ---\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${identityPubkey}\n`)
console.log('PUBLIC KEY (npub):')
console.log(`  ${identityNpub}\n`)
console.log('SECRET KEY (nsec) — admin uses this to log in:')
console.log(`  ${identityNsec}\n`)

console.log('--- Decryption Keypair (note/message encryption) ---\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${decryptionPubkey}\n`)
console.log('PUBLIC KEY (npub):')
console.log(`  ${decryptionNpub}\n`)
console.log('SECRET KEY (nsec) — admin needs this to decrypt notes:')
console.log(`  ${decryptionNsec}\n`)

// --- Server Nostr Secret (relay event signing) ---
const serverNostrSecret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))

console.log('--- Server Nostr Secret (relay event signing) ---\n')
console.log('SERVER_NOSTR_SECRET (hex):')
console.log(`  ${serverNostrSecret}\n`)
console.log('This secret is used to derive the server\'s Nostr keypair for')
console.log('signing real-time events (call notifications, presence, etc.).\n')

console.log('--- Next Steps ---\n')
console.log('1. Set secrets for Cloudflare deployment:')
console.log(`   echo "${identityPubkey}" | bunx wrangler secret put ADMIN_PUBKEY`)
console.log(`   echo "${decryptionPubkey}" | bunx wrangler secret put ADMIN_DECRYPTION_PUBKEY`)
console.log(`   echo "${serverNostrSecret}" | bunx wrangler secret put SERVER_NOSTR_SECRET\n`)
console.log('2. For local development, add to .dev.vars:')
console.log(`   ADMIN_PUBKEY=${identityPubkey}`)
console.log(`   ADMIN_DECRYPTION_PUBKEY=${decryptionPubkey}`)
console.log(`   SERVER_NOSTR_SECRET=${serverNostrSecret}\n`)
console.log('3. For Docker deployment, add to .env:')
console.log(`   ADMIN_PUBKEY=${identityPubkey}`)
console.log(`   SERVER_NOSTR_SECRET=${serverNostrSecret}\n`)
console.log('4. The admin logs in with the IDENTITY nsec.')
console.log('5. The admin imports the DECRYPTION nsec to decrypt notes.')
console.log('   (In the current single-admin setup, both nsecs are entered during onboarding.)\n')
console.log('   IMPORTANT: Store both nsecs securely. They cannot be recovered.\n')
