/**
 * Direct PostgreSQL query helpers for BDD step definitions (Epic 365).
 *
 * Bypasses the API to verify persisted state directly in the database.
 * Uses postgres.js (works in both Node.js/Playwright and Bun contexts).
 *
 * Column names use snake_case (matching PostgreSQL conventions).
 */
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL || 'postgres://llamenos:dev@localhost:5432/llamenos')

/** Validate a SQL identifier (table/column name) to prevent injection. */
function validateIdentifier(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`)
  }
}

export class TestDB {
  /**
   * Get a raw row by id from any table.
   * Returns null if no row found.
   */
  static async getRow(table: string, id: string): Promise<Record<string, unknown> | null> {
    validateIdentifier(table)
    const rows = await sql.unsafe(
      `SELECT * FROM ${table} WHERE id = $1 LIMIT 1`,
      [id],
    )
    return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null
  }

  /**
   * Check if a JSONB column value is a proper object (not double-serialized string).
   *
   * Uses PostgreSQL's `jsonb_typeof()` to detect the actual storage type.
   * Double-serialization stores `"{"key":"val"}"` as a JSON string instead of
   * a JSON object — this helper detects that.
   */
  static async assertJsonbField(
    table: string,
    idColumn: string,
    id: string,
    jsonbColumn: string,
  ): Promise<{
    value: unknown
    pgType: string
    isDoubleStringified: boolean
  }> {
    for (const name of [table, idColumn, jsonbColumn]) {
      validateIdentifier(name)
    }

    const rows = await sql.unsafe(
      `SELECT jsonb_typeof(${jsonbColumn}) as pg_type, ${jsonbColumn} as val FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`,
      [id],
    )

    if (rows.length === 0) {
      throw new Error(`No row found in ${table} where ${idColumn} = '${id}'`)
    }

    const row = rows[0] as { pg_type: string; val: unknown }
    const pgType = row.pg_type
    const value = row.val

    // Double-stringified check: if pgType is 'string' and the string parses as
    // an object/array, the value was double-serialized
    let isDoubleStringified = false
    if (pgType === 'string' && typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (typeof parsed === 'object' && parsed !== null) {
          isDoubleStringified = true
        }
      } catch {
        // Not parseable — it's a genuine string value
      }
    }

    return { value, pgType, isDoubleStringified }
  }

  /**
   * Check if a phone is in the bans table.
   */
  static async isBanned(phone: string): Promise<boolean> {
    const rows = await sql`SELECT 1 FROM bans WHERE phone = ${phone} LIMIT 1`
    return rows.length > 0
  }

  /**
   * Get conversation metadata directly from DB.
   */
  static async getConversationMetadata(id: string): Promise<unknown> {
    const rows = await sql`SELECT * FROM conversations WHERE id = ${id} LIMIT 1`
    return rows.length > 0 ? rows[0] : null
  }

  /**
   * Get volunteer roles from the volunteers table.
   */
  static async getVolunteerRoles(pubkey: string): Promise<string[]> {
    const rows = await sql`SELECT roles FROM volunteers WHERE pubkey = ${pubkey} LIMIT 1`
    if (rows.length === 0) return []
    const row = rows[0] as { roles: string[] }
    return row.roles ?? []
  }

  /**
   * Verify the SHA-256 hash chain in the audit_log table.
   *
   * NOTE: The server computes `createdAt` via `new Date().toISOString()` but the
   * DB column uses `defaultNow()`, so there may be timestamp drift. This helper
   * verifies chain links (previousEntryHash matches prior entryHash) but may
   * not be able to recompute hashes exactly due to this mismatch.
   */
  static async verifyAuditChain(hubId?: string, limit?: number): Promise<{
    valid: boolean
    entries: number
    brokenAt?: number
  }> {
    // Filter by hub_id to verify a single chain in isolation.
    // Different hubs have independent chains; verifying across hubs would
    // interleave entries from separate chains and always fail.
    let rows
    if (hubId) {
      rows = limit !== undefined
        ? await sql`
            SELECT id, action, actor_pubkey, details, previous_entry_hash, entry_hash,
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
            FROM audit_log WHERE hub_id = ${hubId} ORDER BY created_at ASC LIMIT ${limit}`
        : await sql`
            SELECT id, action, actor_pubkey, details, previous_entry_hash, entry_hash,
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
            FROM audit_log WHERE hub_id = ${hubId} ORDER BY created_at ASC`
    } else {
      rows = limit !== undefined
        ? await sql`
            SELECT id, action, actor_pubkey, details, previous_entry_hash, entry_hash,
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
            FROM audit_log WHERE hub_id IS NULL ORDER BY created_at ASC LIMIT ${limit}`
        : await sql`
            SELECT id, action, actor_pubkey, details, previous_entry_hash, entry_hash,
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
            FROM audit_log WHERE hub_id IS NULL ORDER BY created_at ASC`
    }

    if (rows.length === 0) {
      return { valid: true, entries: 0 }
    }

    const { computeAuditEntryHash } = await import('./integrity-helpers')

    let previousHash: string | null = null

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as {
        id: string
        action: string
        actor_pubkey: string
        details: Record<string, unknown> | null
        previous_entry_hash: string | null
        entry_hash: string
        created_at: string
      }

      // Check chain link
      if (row.previous_entry_hash !== previousHash) {
        return { valid: false, entries: rows.length, brokenAt: i }
      }

      // Recompute hash and verify
      const computed = computeAuditEntryHash({
        id: row.id,
        action: row.action,
        actorPubkey: row.actor_pubkey,
        createdAt: row.created_at,
        details: row.details ?? {},
        previousEntryHash: row.previous_entry_hash,
      })

      if (computed !== row.entry_hash) {
        return { valid: false, entries: rows.length, brokenAt: i }
      }

      previousHash = row.entry_hash
    }

    return { valid: true, entries: rows.length }
  }

  /** Close the database connection pool. */
  static async close(): Promise<void> {
    await sql.end()
  }
}
