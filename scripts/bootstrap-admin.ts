#!/usr/bin/env bun
/**
 * Bootstrap the first admin user (CLI method).
 *
 * NOTE: The recommended approach is in-browser bootstrap — simply visit
 * your deployed app and the setup wizard will generate a keypair for you.
 * This CLI script is useful for headless/CI setups where browser access
 * is not available.
 *
 * Usage:
 *   bun run scripts/bootstrap-admin.ts
 *
 * This generates a Nostr keypair and outputs the nsec (secret key)
 * for the admin to use to log in. The public key should be set as
 * the ADMIN_PUBKEY secret in wrangler:
 *
 *   bunx wrangler secret put ADMIN_PUBKEY
 */

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'

const secretKey = generateSecretKey()
const publicKey = getPublicKey(secretKey)
const nsec = nip19.nsecEncode(secretKey)
const npub = nip19.npubEncode(publicKey)

console.log('=== Llámenos Admin Bootstrap ===\n')
console.log('A new admin keypair has been generated.\n')
console.log('PUBLIC KEY (hex):')
console.log(`  ${publicKey}\n`)
console.log('PUBLIC KEY (npub):')
console.log(`  ${npub}\n`)
console.log('SECRET KEY (nsec) — share this securely with the admin:')
console.log(`  ${nsec}\n`)
console.log('--- Next Steps ---\n')
console.log('1. Set the public key as a Cloudflare secret:')
console.log(`   echo "${publicKey}" | bunx wrangler secret put ADMIN_PUBKEY\n`)
console.log('2. For local development, add to .dev.vars:')
console.log(`   ADMIN_PUBKEY=${publicKey}\n`)
console.log('3. The admin can log in with the nsec above.')
console.log('   IMPORTANT: Store the nsec securely. It cannot be recovered.\n')
