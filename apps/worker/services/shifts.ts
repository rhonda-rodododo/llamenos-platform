/**
 * ShiftsService — replaces ShiftManagerDO.
 *
 * Manages shift schedules, determines on-shift volunteers,
 * and tracks push reminder delivery.
 * All state is stored in PostgreSQL via Drizzle ORM.
 */
import { eq, and, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { shifts, pushRemindersSent } from '../db/schema'
import { ServiceError, SettingsService } from './settings'

/** Validate HH:MM format (00:00-23:59) */
function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

/**
 * Check whether a shift is active right now given the current UTC day and time.
 * Handles overnight shifts (startTime > endTime) correctly.
 */
function isShiftActive(
  shift: { startTime: string; endTime: string; days: number[] },
  currentDay: number,
  currentTime: string,
): boolean {
  if (!shift.days.includes(currentDay)) return false

  const startsBeforeEnds = shift.startTime <= shift.endTime
  if (startsBeforeEnds) {
    return currentTime >= shift.startTime && currentTime < shift.endTime
  }
  // Crosses midnight: e.g., 22:00 - 06:00
  return currentTime >= shift.startTime || currentTime < shift.endTime
}

/** Format current UTC time as HH:MM */
function utcTimeNow(now: Date = new Date()): string {
  return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
}

type ShiftRow = typeof shifts.$inferSelect
type ShiftInsert = Omit<typeof shifts.$inferInsert, 'id' | 'createdAt'>

export class ShiftsService {
  constructor(
    protected db: Database,
    private settingsService?: { getFallbackGroup(hubId?: string): Promise<{ userPubkeys: string[] }> },
  ) {}

  // =========================================================================
  // CRUD
  // =========================================================================

  /** List all shifts for a hub */
  async list(hubId: string): Promise<{ shifts: ShiftRow[] }> {
    const rows = await this.db
      .select()
      .from(shifts)
      .where(eq(shifts.hubId, hubId))
    return { shifts: rows }
  }

  /** Create a new shift, return the created row */
  async create(hubId: string, data: ShiftInsert): Promise<ShiftRow> {
    if (!isValidTimeFormat(data.startTime) || !isValidTimeFormat(data.endTime)) {
      throw new ServiceError(400, 'Invalid time format — expected HH:MM (00:00-23:59)')
    }

    const [row] = await this.db
      .insert(shifts)
      .values({
        ...data,
        hubId,
      })
      .returning()

    return row
  }

  /** Update specific fields on a shift */
  async update(
    hubId: string,
    shiftId: string,
    data: Partial<Pick<ShiftInsert, 'name' | 'startTime' | 'endTime' | 'days' | 'userPubkeys'>>,
  ): Promise<ShiftRow> {
    if (data.startTime && !isValidTimeFormat(data.startTime)) {
      throw new ServiceError(400, 'Invalid time format — expected HH:MM (00:00-23:59)')
    }
    if (data.endTime && !isValidTimeFormat(data.endTime)) {
      throw new ServiceError(400, 'Invalid time format — expected HH:MM (00:00-23:59)')
    }

    const [row] = await this.db
      .update(shifts)
      .set(data)
      .where(and(eq(shifts.id, shiftId), eq(shifts.hubId, hubId)))
      .returning()

    if (!row) {
      throw new ServiceError(404, 'Shift not found')
    }

    return row
  }

  /** Delete a shift */
  async delete(hubId: string, shiftId: string): Promise<{ ok: true }> {
    const result = await this.db
      .delete(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.hubId, hubId)))
      .returning({ id: shifts.id })

    if (result.length === 0) {
      throw new ServiceError(404, 'Shift not found')
    }

    return { ok: true }
  }

  // =========================================================================
  // Shift Status
  // =========================================================================

  /**
   * Determine whether a specific volunteer is currently on-shift.
   * Returns current shift info and next upcoming shift.
   */
  async getMyStatus(hubId: string, pubkey: string): Promise<{
    onShift: boolean
    currentShift: { name: string; startTime: string; endTime: string } | null
    nextShift: { name: string; startTime: string; endTime: string; day: number } | null
  }> {
    const { shifts: allShifts } = await this.list(hubId)
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentTime = utcTimeNow(now)

    // Filter to shifts that include this volunteer
    const myShifts = allShifts.filter(s => s.userPubkeys.includes(pubkey))

    // Find current active shift
    let currentShift: { name: string; startTime: string; endTime: string } | null = null
    for (const shift of myShifts) {
      if (isShiftActive(shift, currentDay, currentTime)) {
        currentShift = { name: shift.name, startTime: shift.startTime, endTime: shift.endTime }
        break
      }
    }

    // Find next upcoming shift
    let nextShift: { name: string; startTime: string; endTime: string; day: number } | null = null
    if (myShifts.length > 0) {
      let bestMinutesAway = Infinity
      const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()

      for (const shift of myShifts) {
        for (const day of shift.days) {
          const [h, m] = shift.startTime.split(':').map(Number)
          const shiftMinutes = h * 60 + m

          let daysAway = day - currentDay
          if (daysAway < 0) daysAway += 7
          if (daysAway === 0 && shiftMinutes <= currentMinutes) daysAway = 7

          const minutesAway = daysAway * 24 * 60 + (shiftMinutes - currentMinutes)
          if (minutesAway > 0 && minutesAway < bestMinutesAway) {
            // Skip if this is the currently active shift
            if (currentShift && shift.name === currentShift.name && daysAway === 0) continue
            bestMinutesAway = minutesAway
            nextShift = { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, day }
          }
        }
      }
    }

    return { onShift: currentShift !== null, currentShift, nextShift }
  }

  /**
   * List pubkeys of all currently on-shift volunteers.
   * Falls back to the fallback group from SettingsService if no shifts are defined or active.
   */
  async getCurrentVolunteers(hubId: string): Promise<string[]> {
    const { shifts: allShifts } = await this.list(hubId)
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentTime = utcTimeNow(now)

    const activeVolunteers = new Set<string>()

    for (const shift of allShifts) {
      if (isShiftActive(shift, currentDay, currentTime)) {
        for (const pubkey of shift.userPubkeys) {
          activeVolunteers.add(pubkey)
        }
      }
    }

    // Fallback to settings group if no active volunteers and a settings service is available
    if (activeVolunteers.size === 0 && this.settingsService) {
      const fallback = await this.settingsService.getFallbackGroup(hubId)
      return fallback.userPubkeys
    }

    return Array.from(activeVolunteers)
  }

  // =========================================================================
  // Push Reminder Tracking
  // =========================================================================

  /** Record that a reminder was sent for a shift/date/volunteer */
  async markReminderSent(shiftId: string, date: string, pubkey: string): Promise<void> {
    await this.db
      .insert(pushRemindersSent)
      .values({ shiftId, reminderDate: date, pubkey })
      .onConflictDoNothing()
  }

  /** Check whether a reminder has already been sent */
  async hasReminderBeenSent(shiftId: string, date: string, pubkey: string): Promise<boolean> {
    const [row] = await this.db
      .select({ shiftId: pushRemindersSent.shiftId })
      .from(pushRemindersSent)
      .where(
        and(
          eq(pushRemindersSent.shiftId, shiftId),
          eq(pushRemindersSent.reminderDate, date),
          eq(pushRemindersSent.pubkey, pubkey),
        ),
      )
      .limit(1)

    return !!row
  }

  // =========================================================================
  // Reset (demo/dev only)
  // =========================================================================

  /** Truncate all shifts and reminder tracking for a hub */
  async reset(hubId: string): Promise<{ ok: true }> {
    await this.db.delete(shifts).where(eq(shifts.hubId, hubId))
    // Clean up orphaned reminders for deleted shifts
    // (pushRemindersSent has no hubId — delete all for shift IDs that no longer exist)
    await this.db.execute(sql`
      DELETE FROM push_reminders_sent
      WHERE shift_id NOT IN (SELECT id FROM shifts)
    `)
    return { ok: true }
  }
}
