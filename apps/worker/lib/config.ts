/**
 * Startup configuration validation for the Llamenos worker server.
 *
 * Call validateConfig() at Bun startup (before any service initialization)
 * to catch misconfigured deployments immediately with a clear error message.
 *
 * Required vars are asserted to be non-empty and well-formed.
 * Optional vars log a warning when absent — they disable specific features
 * (push, relay) without failing startup.
 *
 * This is the canonical validation implementation. See spec:
 * docs/superpowers/specs/2026-03-21-hardening-final.md Gap 4.
 */

const HEX_RE = /^[0-9a-f]+$/

type ConfigInput = Partial<Record<string, string | undefined>>

function assertNonEmpty(env: ConfigInput, key: string): void {
  const val = env[key]
  if (!val || val.trim() === '') {
    throw new Error(
      `[llamenos] Required environment variable ${key} is missing or empty. ` +
      `Set it before starting the server.`
    )
  }
}

function assertHex64(env: ConfigInput, key: string): void {
  assertNonEmpty(env, key)
  const val = env[key]!.trim()
  if (val.length !== 64 || !HEX_RE.test(val)) {
    throw new Error(
      `[llamenos] ${key} must be exactly 64 lowercase hex characters (got length ${val.length}). ` +
      `Generate with: openssl rand -hex 32`
    )
  }
}

function assertDatabaseUrl(env: ConfigInput): void {
  assertNonEmpty(env, 'DATABASE_URL')
  const val = env['DATABASE_URL']!.trim()
  if (!val.startsWith('postgres://') && !val.startsWith('postgresql://')) {
    throw new Error(
      `[llamenos] DATABASE_URL must start with postgres:// or postgresql:// (got: ${val.slice(0, 20)}...)`
    )
  }
}

import { createLogger } from './logger'

const logger = createLogger('config')

function warnIfAbsent(env: ConfigInput, key: string, featureNote: string): void {
  if (!env[key]?.trim()) {
    logger.warn(`Optional ${key} not set — ${featureNote}`)
  }
}

/**
 * Validate all required environment variables for the Llamenos worker server.
 * Throws a descriptive Error for any missing or malformed required var.
 * Logs warnings for absent optional vars.
 *
 * @param env - Environment object to validate (defaults to process.env).
 */
export function validateConfig(env: ConfigInput = process.env): void {
  // --- Required vars ---
  assertDatabaseUrl(env)
  assertHex64(env, 'HMAC_SECRET')
  assertHex64(env, 'SERVER_NOSTR_SECRET')

  // ADMIN_PUBKEY: 64 hex chars (Nostr pubkey, x-only compressed)
  assertNonEmpty(env, 'ADMIN_PUBKEY')
  const adminPubkey = env['ADMIN_PUBKEY']!.trim()
  if (adminPubkey.length !== 64 || !HEX_RE.test(adminPubkey)) {
    throw new Error(
      `[llamenos] ADMIN_PUBKEY must be exactly 64 hex characters (Nostr x-only pubkey). Got length ${adminPubkey.length}. ` +
      `Generate with: bun run bootstrap-admin`
    )
  }

  assertNonEmpty(env, 'HOTLINE_NAME')
  assertNonEmpty(env, 'ENVIRONMENT')

  // --- Optional vars (warn when absent, do not fail) ---
  warnIfAbsent(env, 'NOSTR_RELAY_URL', 'real-time relay disabled')
  warnIfAbsent(env, 'FCM_SERVICE_ACCOUNT_KEY', 'Android push notifications disabled')
  warnIfAbsent(env, 'APNS_KEY_P8', 'iOS push notifications disabled')
  warnIfAbsent(env, 'APNS_KEY_ID', 'iOS push notifications disabled')
  warnIfAbsent(env, 'APNS_TEAM_ID', 'iOS push notifications disabled')
}
