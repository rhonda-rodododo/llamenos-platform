/**
 * SecurityPrefsService — per-user alert channel and notification preferences.
 *
 * Rows are lazily created on first access with safe defaults (web_push, weekly digest).
 */
import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { userSecurityPrefs, type UserSecurityPrefsRow } from '../db/schema/signal-notifications'

const DEFAULTS = {
  notificationChannel: 'web_push' as const,
  disappearingTimerDays: 1,
  digestCadence: 'weekly' as const,
  alertOnNewDevice: true,
  alertOnPasskeyChange: true,
  alertOnPinChange: true,
}

export class SecurityPrefsService {
  constructor(private db: Database) {}

  /** Get prefs for a user, creating defaults on first access. */
  async get(userPubkey: string): Promise<UserSecurityPrefsRow> {
    const rows = await this.db
      .select()
      .from(userSecurityPrefs)
      .where(eq(userSecurityPrefs.userPubkey, userPubkey))
      .limit(1)
    if (rows[0]) return rows[0]

    const inserted = await this.db
      .insert(userSecurityPrefs)
      .values({ userPubkey, ...DEFAULTS })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('Failed to insert security prefs')
    return row
  }

  /** Partially update prefs. Unknown fields are ignored. */
  async update(
    userPubkey: string,
    patch: Partial<Omit<UserSecurityPrefsRow, 'userPubkey' | 'updatedAt'>>
  ): Promise<UserSecurityPrefsRow> {
    // Ensure the row exists before updating
    await this.get(userPubkey)
    const rows = await this.db
      .update(userSecurityPrefs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userSecurityPrefs.userPubkey, userPubkey))
      .returning()
    const row = rows[0]
    if (!row) throw new Error('Failed to update security prefs')
    return row
  }
}
