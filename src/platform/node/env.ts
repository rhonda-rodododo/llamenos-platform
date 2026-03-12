/**
 * Node.js environment shim — creates an Env object that matches
 * the Cloudflare Workers Env interface, using local implementations.
 *
 * - DO namespaces → PostgreSQL-backed singletons
 * - AI binding → self-hosted Whisper HTTP client
 * - R2_BUCKET → MinIO S3 client
 * - Secrets → process.env or /run/secrets/ files
 */
import { createDONamespace, storageInstances } from './durable-object'
import { createBlobStorage } from './blob-storage'
import { createTranscriptionService } from './transcription'
import { initPostgresPool, getPool } from './storage/postgres-pool'
import { startAlarmPoller } from './storage/alarm-poller'
import { runStartupMigrations } from './storage/startup-migrations'
import fs from 'node:fs'

/**
 * Read a secret from /run/secrets/ (Docker secrets) or fall back to env var.
 */
function readSecret(name: string, envKey?: string): string {
  const filePath = `/run/secrets/${name}`
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    const key = envKey || name.toUpperCase().replace(/-/g, '_')
    return process.env[key] || ''
  }
}

/**
 * Creates the full Env object for Node.js runtime.
 * This is called once at server startup.
 *
 * The DO classes are imported dynamically to avoid circular dependencies
 * with the platform module.
 */
export async function createNodeEnv(): Promise<Record<string, unknown>> {
  // Initialize PostgreSQL
  await initPostgresPool()

  // Import DO classes dynamically
  const { IdentityDO } = await import('../../../apps/worker/durable-objects/identity-do')
  const { SettingsDO } = await import('../../../apps/worker/durable-objects/settings-do')
  const { RecordsDO } = await import('../../../apps/worker/durable-objects/records-do')
  const { ShiftManagerDO } = await import('../../../apps/worker/durable-objects/shift-manager')
  const { CallRouterDO } = await import('../../../apps/worker/durable-objects/call-router')
  const { ConversationDO } = await import('../../../apps/worker/durable-objects/conversation-do')
  const { BlastDO } = await import('../../../apps/worker/durable-objects/blast-do')

  // Read secrets
  const adminPubkey = readSecret('admin-pubkey', 'ADMIN_PUBKEY')
  const adminDecryptionPubkey = process.env.ADMIN_DECRYPTION_PUBKEY || ''
  const hmacSecret = readSecret('hmac-secret', 'HMAC_SECRET')
  const twilioAccountSid = readSecret('twilio-account-sid', 'TWILIO_ACCOUNT_SID')
  const twilioAuthToken = readSecret('twilio-auth-token', 'TWILIO_AUTH_TOKEN')
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || ''

  // Nostr relay config (self-hosted strfry)
  const serverNostrSecret = readSecret('server-nostr-secret', 'SERVER_NOSTR_SECRET')
  const nostrRelayUrl = process.env.NOSTR_RELAY_URL || ''

  // Create the env object (without DO namespaces initially)
  const env: Record<string, unknown> = {
    ADMIN_PUBKEY: adminPubkey,
    ADMIN_DECRYPTION_PUBKEY: adminDecryptionPubkey || undefined,
    HMAC_SECRET: hmacSecret,
    HOTLINE_NAME: process.env.HOTLINE_NAME || 'Hotline',
    ENVIRONMENT: process.env.ENVIRONMENT || 'production',
    TWILIO_ACCOUNT_SID: twilioAccountSid,
    TWILIO_AUTH_TOKEN: twilioAuthToken,
    TWILIO_PHONE_NUMBER: twilioPhoneNumber,
    DEMO_MODE: process.env.DEMO_MODE || undefined,
    DEMO_RESET_CRON: process.env.DEMO_RESET_CRON || undefined,
    AI: createTranscriptionService(),
    R2_BUCKET: createBlobStorage(),
    // Nostr relay (Epic 76.1)
    SERVER_NOSTR_SECRET: serverNostrSecret || undefined,
    NOSTR_RELAY_URL: nostrRelayUrl || undefined,
    NOSTR_RELAY_PUBLIC_URL: process.env.NOSTR_RELAY_PUBLIC_URL || undefined,
    // GlitchTip/Sentry DSN for client-side crash reporting (Epic 293)
    GLITCHTIP_DSN: process.env.GLITCHTIP_DSN || undefined,
    // Dev/test support
    DEV_RESET_SECRET: process.env.DEV_RESET_SECRET || undefined,
    E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || undefined,
  }

  // Create DO namespaces that pass env to each instance
  env.IDENTITY_DO = createDONamespace(IdentityDO as any, 'identity', env)
  env.SETTINGS_DO = createDONamespace(SettingsDO as any, 'settings', env)
  env.RECORDS_DO = createDONamespace(RecordsDO as any, 'records', env)
  env.SHIFT_MANAGER = createDONamespace(ShiftManagerDO as any, 'shifts', env)
  env.CALL_ROUTER = createDONamespace(CallRouterDO as any, 'calls', env)
  env.CONVERSATION_DO = createDONamespace(ConversationDO as any, 'conversations', env)
  env.BLAST_DO = createDONamespace(BlastDO as any, 'blasts', env)

  // Run migrations for all existing namespaces before accepting traffic
  await runStartupMigrations()

  // Start alarm poller (storageInstances is populated as DOs are created above)
  startAlarmPoller(storageInstances)

  return env
}
