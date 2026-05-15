/**
 * ActiveShiftsService — EP07 clock-in/out, heartbeat, stale cleanup.
 *
 * Tracks which volunteers are currently clocked in for a hub.
 * All state is stored in PostgreSQL via Drizzle ORM.
 */
import { eq, and, lt } from 'drizzle-orm'
import type { Database } from '../db'
import { activeShifts } from '../db/schema'
import { ServiceError } from './settings'

// ---------------------------------------------------------------------------
// Inferred row types from Drizzle schema
// ---------------------------------------------------------------------------

type ActiveShiftRow = typeof activeShifts.$inferSelect

export class ActiveShiftsService {
  constructor(protected db: Database) {}

  // =========================================================================
  // Clock In / Out
  // =========================================================================

  /** Clock a volunteer into a hub shift */
  async clockIn(
    pubkey: string,
    hubId: string,
  ): Promise<ActiveShiftRow> {
    const now = new Date()

    // Upsert: if already clocked in, update the heartbeat
    const [row] = await this.db
      .insert(activeShifts)
      .values({
        pubkey,
        hubId,
        startedAt: now,
        lastHeartbeat: now,
      })
      .onConflictDoUpdate({
        target: [activeShifts.pubkey, activeShifts.hubId],
        set: {
          lastHeartbeat: now,
          // Keep original startedAt on re-clock
          startedAt: now,
        },
      })
      .returning()

    return row
  }

  /** Clock a volunteer out of a hub shift */
  async clockOut(
    pubkey: string,
    hubId: string,
  ): Promise<{ ok: true }> {
    const result = await this.db
      .delete(activeShifts)
      .where(
        and(
          eq(activeShifts.pubkey, pubkey),
          eq(activeShifts.hubId, hubId),
        ),
      )
      .returning({ pubkey: activeShifts.pubkey })

    if (result.length === 0) {
      throw new ServiceError(404, 'Active shift not found')
    }

    return { ok: true }
  }

  // =========================================================================
  // Heartbeat
  // =========================================================================

  /** Update the heartbeat timestamp for an active shift */
  async heartbeat(
    pubkey: string,
    hubId: string,
    now: Date = new Date(),
  ): Promise<ActiveShiftRow> {
    const [row] = await this.db
      .update(activeShifts)
      .set({ lastHeartbeat: now })
      .where(
        and(
          eq(activeShifts.pubkey, pubkey),
          eq(activeShifts.hubId, hubId),
        ),
      )
      .returning()

    if (!row) {
      throw new ServiceError(404, 'Active shift not found — clock in first')
    }

    return row
  }

  // =========================================================================
  // Status Queries
  // =========================================================================

  /** Check if a volunteer is currently clocked into a hub */
  async getActive(
    pubkey: string,
    hubId: string,
  ): Promise<ActiveShiftRow | null> {
    const [row] = await this.db
      .select()
      .from(activeShifts)
      .where(
        and(
          eq(activeShifts.pubkey, pubkey),
          eq(activeShifts.hubId, hubId),
        ),
      )
      .limit(1)

    return row ?? null
  }

  /** List all volunteers currently clocked into a hub */
  async listActiveByHub(hubId: string): Promise<{ activeShifts: ActiveShiftRow[] }> {
    const rows = await this.db
      .select()
      .from(activeShifts)
      .where(eq(activeShifts.hubId, hubId))
    return { activeShifts: rows }
  }

  /** List all hubs a volunteer is currently clocked into */
  async listActiveByUser(pubkey: string): Promise<{ activeShifts: ActiveShiftRow[] }> {
    const rows = await this.db
      .select()
      .from(activeShifts)
      .where(eq(activeShifts.pubkey, pubkey))
    return { activeShifts: rows }
  }

  // =========================================================================
  // Stale Cleanup
  // =========================================================================

  /**
   * Remove active shift records whose heartbeat is older than the timeout.
   * Returns the number of cleaned-up records.
   */
  async cleanupStale(timeoutMinutes: number): Promise<{ removed: number }> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000)

    const result = await this.db
      .delete(activeShifts)
      .where(lt(activeShifts.lastHeartbeat, cutoff))
      .returning({ pubkey: activeShifts.pubkey, hubId: activeShifts.hubId })

    return { removed: result.length }
  }
}
