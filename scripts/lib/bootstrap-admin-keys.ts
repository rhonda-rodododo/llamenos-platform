/**
 * Key derivation + operator-facing output for `bun run bootstrap-admin`.
 *
 * Kept separate from scripts/bootstrap-admin.ts (which has side effects on
 * import) so the derivation and the printed output can be unit-tested.
 *
 * Model (per-device keys, see docs/protocol/PROTOCOL.md): an admin is ONE
 * Ed25519 device seed. Both public keys derive from it exactly as the desktop
 * client does on seed import (`derive_encryption_seed_from_signing`):
 *   - signing pubkey     = Ed25519(seed)
 *   - encryption pubkey  = X25519(HKDF-SHA256(seed, salt="", info=LABEL_DEVICE_ENCRYPTION_SEED))
 * The seed is the ONLY secret. It must never be placed in server config.
 */

import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { LABEL_DEVICE_ENCRYPTION_SEED } from '../../packages/shared/crypto-labels'

export interface AdminBootstrapKeys {
  /** SECRET — 32-byte Ed25519 device seed, hex. Imported by the admin at login. */
  seedHex: string
  /** PUBLIC — Ed25519 signing pubkey, hex. Value for `ADMIN_PUBKEY`. */
  signingPubkeyHex: string
  /** PUBLIC — X25519 device-encryption pubkey, hex. Value for `ADMIN_DECRYPTION_PUBKEY`. */
  encryptionPubkeyHex: string
}

/** Derive both public keys from a device seed. */
export function deriveAdminKeys(seed: Uint8Array): AdminBootstrapKeys {
  if (seed.length !== 32) throw new Error(`device seed must be 32 bytes, got ${seed.length}`)
  const encryptionSeed = hkdf(sha256, seed, new Uint8Array(0), utf8ToBytes(LABEL_DEVICE_ENCRYPTION_SEED), 32)
  return {
    seedHex: bytesToHex(seed),
    signingPubkeyHex: bytesToHex(ed25519.getPublicKey(seed)),
    encryptionPubkeyHex: bytesToHex(x25519.getPublicKey(encryptionSeed)),
  }
}

/** Generate a fresh admin device seed and derive its public keys. */
export function generateAdminKeys(): AdminBootstrapKeys {
  return deriveAdminKeys(crypto.getRandomValues(new Uint8Array(32)))
}

/** The operator-facing report. Secrets appear only under the SECRET heading. */
export function formatBootstrapOutput(keys: AdminBootstrapKeys, serverSecretHex: string): string {
  return [
    '=== Llámenos Admin Bootstrap ===',
    '',
    'One admin device key was generated. Two PUBLIC keys are derived from it.',
    '',
    '--- PUBLIC values (safe to put in server config) ---',
    '',
    'ADMIN_PUBKEY (Ed25519 signing public key, hex):',
    `  ${keys.signingPubkeyHex}`,
    '',
    'ADMIN_DECRYPTION_PUBKEY (X25519 device-encryption public key, hex):',
    `  ${keys.encryptionPubkeyHex}`,
    '',
    '--- SECRET values — NEVER put these in server config, .env, or a ticket ---',
    '',
    'ADMIN SECRET SEED (hex) — the admin imports this at the login screen:',
    `  ${keys.seedHex}`,
    '',
    'SERVER_SECRET (hex) — server-side only; derives the relay event-signing key:',
    `  ${serverSecretHex}`,
    '',
    'WARNING: anyone holding the admin seed IS the admin and can decrypt admin-wrapped',
    'data. Store it in a password manager. It cannot be recovered. ADMIN_PUBKEY and',
    'ADMIN_DECRYPTION_PUBKEY are served to clients; the seed must never be.',
    '',
    '--- Next Steps ---',
    '',
    'Local dev (.env) — all three:',
    `  ADMIN_PUBKEY=${keys.signingPubkeyHex}`,
    `  ADMIN_DECRYPTION_PUBKEY=${keys.encryptionPubkeyHex}`,
    '  SERVER_SECRET=<the SERVER_SECRET value above>',
    '',
    'Docker (deploy/docker/.env): docker-compose.yml currently forwards only ADMIN_PUBKEY',
    'and SERVER_SECRET to the app, so set those two. Never set the seed.',
    '',
    'ADMIN_PUBKEY pins the platform admin: the account with that pubkey always keeps',
    'role-super-admin. The server does NOT create the account from it, and the first-run',
    'setup wizard generates its own key rather than importing this one. The account must',
    'be registered with POST /api/auth/bootstrap, signed by this seed\'s Ed25519 key.',
    'Preferred: use the wizard and copy the pubkey it shows into ADMIN_PUBKEY instead.',
    '',
  ].join('\n')
}
