/**
 * TTL (Time-To-Live) constants for storage cleanup across all Durable Objects.
 *
 * Each constant defines how long a particular record type should be retained
 * before being eligible for automatic cleanup by the DO alarm handler.
 *
 * Values are in milliseconds. Admin-configurable overrides are stored in
 * SettingsDO under 'ttlOverrides' and take precedence over these defaults.
 */

// --- SettingsDO TTLs ---

/** How long CAPTCHA challenge entries remain before cleanup (default: 5 min) */
export const TTL_CAPTCHA_CHALLENGE_MS = 5 * 60 * 1000

/** How long rate limit timestamp arrays remain after last activity (default: 2 min) */
export const TTL_RATE_LIMIT_MS = 2 * 60 * 1000

// --- IdentityDO TTLs ---

/** How long expired sessions are retained before deletion (default: 0 — delete immediately on expiry) */
export const TTL_EXPIRED_SESSION_MS = 0

/** How long provisioning rooms remain before cleanup (default: 5 min) */
export const TTL_PROVISION_ROOM_MS = 5 * 60 * 1000

/** How long redeemed/expired invites are retained in the invites list (default: 30 days) */
export const TTL_REDEEMED_INVITE_MS = 30 * 24 * 60 * 60 * 1000

/** How long expired (unredeemed) invites are retained (default: 7 days after expiry) */
export const TTL_EXPIRED_INVITE_MS = 7 * 24 * 60 * 60 * 1000

/** How long WebAuthn challenges remain before cleanup (default: 5 min) */
export const TTL_WEBAUTHN_CHALLENGE_MS = 5 * 60 * 1000

// --- ConversationDO TTLs ---

/** How long file uploads stuck in 'uploading' status are kept (default: 24 hours) */
export const TTL_STALE_FILE_UPLOAD_MS = 24 * 60 * 60 * 1000

/** How long completed blast delivery queues are retained (default: 7 days) */
export const TTL_COMPLETED_BLAST_QUEUE_MS = 7 * 24 * 60 * 60 * 1000

// --- Alarm scheduling ---

/** Default alarm interval for periodic cleanup sweeps (default: 15 min) */
export const CLEANUP_ALARM_INTERVAL_MS = 15 * 60 * 1000

/**
 * TTL override keys that admins can configure.
 * Maps to the admin-facing setting name and the default value.
 */
export const TTL_OVERRIDE_KEYS = {
  captchaChallenge: TTL_CAPTCHA_CHALLENGE_MS,
  rateLimit: TTL_RATE_LIMIT_MS,
  provisionRoom: TTL_PROVISION_ROOM_MS,
  redeemedInvite: TTL_REDEEMED_INVITE_MS,
  expiredInvite: TTL_EXPIRED_INVITE_MS,
  webauthnChallenge: TTL_WEBAUTHN_CHALLENGE_MS,
  staleFileUpload: TTL_STALE_FILE_UPLOAD_MS,
  completedBlastQueue: TTL_COMPLETED_BLAST_QUEUE_MS,
} as const

export type TTLOverrideKey = keyof typeof TTL_OVERRIDE_KEYS

export interface TTLOverrides {
  [key: string]: number
}

/**
 * Resolve a TTL value: use admin override if set, otherwise default.
 */
export function resolveTTL(key: TTLOverrideKey, overrides?: TTLOverrides): number {
  if (overrides && typeof overrides[key] === 'number' && overrides[key] >= 0) {
    return overrides[key]
  }
  return TTL_OVERRIDE_KEYS[key]
}

/**
 * Validate TTL override values. Returns error message or null if valid.
 */
export function validateTTLOverrides(data: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(data)) {
    if (!(key in TTL_OVERRIDE_KEYS)) {
      return `Unknown TTL key: ${key}`
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return `TTL value for ${key} must be a non-negative number`
    }
    // Cap at 365 days to prevent nonsensical values
    if (value > 365 * 24 * 60 * 60 * 1000) {
      return `TTL value for ${key} exceeds maximum (365 days)`
    }
  }
  return null
}

/**
 * Metrics tracker for storage cleanup operations.
 * Each DO accumulates counts during alarm(), then exposes them.
 */
export interface CleanupMetrics {
  captchaChallengesDeleted: number
  rateLimitEntriesDeleted: number
  expiredSessionsDeleted: number
  provisionRoomsDeleted: number
  expiredInvitesCleaned: number
  webauthnChallengesDeleted: number
  staleFileUploadsDeleted: number
  completedBlastQueuesDeleted: number
  lastCleanupAt: string | null
}

export function emptyCleanupMetrics(): CleanupMetrics {
  return {
    captchaChallengesDeleted: 0,
    rateLimitEntriesDeleted: 0,
    expiredSessionsDeleted: 0,
    provisionRoomsDeleted: 0,
    expiredInvitesCleaned: 0,
    webauthnChallengesDeleted: 0,
    staleFileUploadsDeleted: 0,
    completedBlastQueuesDeleted: 0,
    lastCleanupAt: null,
  }
}
