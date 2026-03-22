/**
 * AuditService — hash-chained audit log backed by PostgreSQL.
 *
 * Replaces the audit methods formerly in RecordsDO + the legacy `audit()`
 * helper that delegated to the DO via fetch.
 *
 * The hash chain guarantees tamper detection: each entry stores the SHA-256
 * hash of the previous entry. Verification walks the chain backward.
 */
import { eq, and, desc, sql, count, gte, lte, inArray } from 'drizzle-orm'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import type { Database } from '../db'
import { auditLog } from '../db/schema'
import { hashIP } from '../lib/crypto'
import { ServiceError } from './settings'

// ---------------------------------------------------------------------------
// Event type category mapping (for filtered queries)
// ---------------------------------------------------------------------------

const EVENT_CATEGORIES: Record<string, string[]> = {
  authentication: [
    'login', 'logout', 'sessionCreated', 'sessionExpired',
    'passkeyRegistered', 'deviceLinked',
  ],
  users: [
    'userAdded', 'userRemoved', 'volunteerRoleChanged',
    'volunteerActivated', 'userDeactivated', 'volunteerOnBreak',
    'volunteerOffBreak', 'inviteCreated', 'inviteRedeemed',
  ],
  calls: [
    'callAnswered', 'callEnded', 'callMissed',
    'spamReported', 'voicemailReceived',
  ],
  settings: [
    'settingsUpdated', 'telephonyConfigured', 'transcriptionToggled',
    'ivrUpdated', 'customFieldsUpdated', 'spamSettingsUpdated',
    'callSettingsUpdated',
  ],
  shifts: ['shiftCreated', 'shiftUpdated', 'shiftDeleted'],
  notes: ['noteCreated', 'noteUpdated'],
  messaging: [
    'messageSent', 'conversationClaimed', 'conversationClosed',
    'conversationUpdated', 'reportCreated', 'reportAssigned',
    'reportUpdated',
  ],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditListFilters {
  action?: string
  actorPubkey?: string
  /** Event category key (maps to EVENT_CATEGORIES) */
  eventType?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  limit?: number
  offset?: number
  page?: number
}

export type AuditEntry = typeof auditLog.$inferSelect

// ---------------------------------------------------------------------------
// Hash computation (matches lib/crypto.ts hashAuditEntry but works on DB row)
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON serialization with sorted keys.
 * PostgreSQL JSONB stores keys sorted — using sorted keys here ensures
 * the stored hash matches any recomputation from DB-retrieved data.
 */
function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      )
    }
    return val
  })
}

function computeEntryHash(entry: {
  id: string
  action: string
  actorPubkey: string
  createdAt: string
  details: Record<string, unknown> | null
  previousEntryHash: string | null
}): string {
  const content = `${entry.id}:${entry.action}:${entry.actorPubkey}:${entry.createdAt}:${stableJsonStringify(entry.details ?? {})}:${entry.previousEntryHash ?? ''}`
  return bytesToHex(sha256(utf8ToBytes(content)))
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AuditService {
  constructor(protected db: Database) {}

  /**
   * Append an entry to the hash-chained audit log.
   *
   * Uses `SELECT ... FOR UPDATE` inside a transaction to serialise
   * concurrent writes and guarantee a correct hash chain.
   */
  async log(
    action: string,
    actorPubkey: string,
    details: Record<string, unknown> = {},
    hubId?: string,
  ): Promise<AuditEntry> {
    // Validate actorPubkey format: 'system' or 64-char hex
    if (actorPubkey !== 'system' && !/^[0-9a-f]{64}$/.test(actorPubkey)) {
      throw new ServiceError(400, 'Invalid actorPubkey format')
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    return await this.db.transaction(async (tx) => {
      // Get latest entry hash with FOR UPDATE to serialise chain writes
      const [latest] = await tx
        .select({ entryHash: auditLog.entryHash })
        .from(auditLog)
        .where(hubId ? eq(auditLog.hubId, hubId) : sql`${auditLog.hubId} IS NULL`)
        .orderBy(desc(auditLog.createdAt))
        .limit(1)
        .for('update')

      const previousEntryHash = latest?.entryHash ?? null

      const entryHash = computeEntryHash({
        id,
        action,
        actorPubkey,
        createdAt,
        details,
        previousEntryHash,
      })

      const [row] = await tx
        .insert(auditLog)
        .values({
          id,
          hubId: hubId ?? null,
          action,
          actorPubkey,
          details,
          previousEntryHash,
          entryHash,
          createdAt: new Date(createdAt),
        })
        .returning()

      return row
    })
  }

  /**
   * List audit entries with pagination and optional filters.
   */
  async list(
    hubId: string | undefined,
    filters: AuditListFilters = {},
  ): Promise<{ entries: AuditEntry[]; total: number }> {
    const {
      action,
      actorPubkey,
      eventType,
      dateFrom,
      dateTo,
      search,
      limit = 50,
      page,
      offset: rawOffset,
    } = filters
    const offset = page != null ? (page - 1) * limit : (rawOffset ?? 0)

    const conditions = []

    // Hub scope
    if (hubId) {
      conditions.push(eq(auditLog.hubId, hubId))
    }

    // Direct action match
    if (action) {
      conditions.push(eq(auditLog.action, action))
    }

    // Event category filter (maps category name to allowed action list)
    if (eventType && EVENT_CATEGORIES[eventType]) {
      const allowed = EVENT_CATEGORIES[eventType]
      conditions.push(inArray(auditLog.action, allowed))
    }

    // Actor filter
    if (actorPubkey) {
      conditions.push(eq(auditLog.actorPubkey, actorPubkey))
    }

    // Date range
    if (dateFrom) {
      conditions.push(gte(auditLog.createdAt, new Date(dateFrom)))
    }
    if (dateTo) {
      conditions.push(lte(auditLog.createdAt, new Date(dateTo + 'T23:59:59.999Z')))
    }

    // Full-text search across action, actor, and details
    if (search) {
      const pattern = `%${search.toLowerCase()}%`
      conditions.push(
        sql`(
          lower(${auditLog.action}) LIKE ${pattern}
          OR lower(${auditLog.actorPubkey}) LIKE ${pattern}
          OR lower(${auditLog.details}::text) LIKE ${pattern}
        )`,
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(auditLog)
        .where(where),
    ])

    return { entries: rows, total: Number(total) }
  }

  /**
   * Get the latest entry hash for a hub (or global if no hubId).
   * Used for chain verification / integrity checks.
   */
  async getLatestHash(hubId?: string): Promise<string | null> {
    const [row] = await this.db
      .select({ entryHash: auditLog.entryHash })
      .from(auditLog)
      .where(hubId ? eq(auditLog.hubId, hubId) : sql`${auditLog.hubId} IS NULL`)
      .orderBy(desc(auditLog.createdAt))
      .limit(1)

    return row?.entryHash ?? null
  }

  /** Clear all audit log entries (test/demo reset only). */
  async reset(): Promise<void> {
    await this.db.delete(auditLog)
  }
}

// ---------------------------------------------------------------------------
// Convenience helper — enriches details with request metadata then logs.
// Drop-in replacement for the old `audit()` function that hit the DO.
// ---------------------------------------------------------------------------

export async function audit(
  auditService: AuditService,
  event: string,
  actorPubkey: string,
  details: Record<string, unknown> = {},
  ctx?: { request: Request; hmacSecret: string },
  hubId?: string,
): Promise<void> {
  const meta: Record<string, unknown> = {}
  if (ctx) {
    const rawIp = ctx.request.headers.get('CF-Connecting-IP')
      ?? ctx.request.headers.get('x-forwarded-for')
    meta.ip = rawIp ? hashIP(rawIp, ctx.hmacSecret) : null
    meta.country = ctx.request.headers.get('CF-IPCountry')
    meta.ua = ctx.request.headers.get('User-Agent')
  }
  await auditService.log(event, actorPubkey, { ...details, ...meta }, hubId)
}

// Re-export for convenience
export { auditLog } from '../db/schema'
