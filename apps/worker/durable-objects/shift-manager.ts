import { DurableObject } from 'cloudflare:workers'
import type { Env, Shift } from '../types'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '@shared/migrations/runner'
import { migrations } from '@shared/migrations'
import { registerMigrationRoutes } from '@shared/migrations/do-routes'
import { createPushDispatcher } from '../lib/push-dispatch'

/** Validate HH:MM format (00:00–23:59) */
function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

/**
 * ShiftManagerDO — manages shift schedules and routing.
 * Determines which volunteers should receive calls at any given time.
 */
export class ShiftManagerDO extends DurableObject<Env> {
  private migrated = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    this.router.get('/shifts', () => this.getShifts())
    this.router.post('/shifts', async (req) => this.createShift(await req.json()))
    this.router.patch('/shifts/:id', async (req, { id }) => this.updateShift(id, await req.json()))
    this.router.delete('/shifts/:id', (_req, { id }) => this.deleteShift(id))
    this.router.get('/current-volunteers', () => this.getCurrentVolunteers())
    this.router.get('/my-status', (req) => {
      const pubkey = new URL(req.url).searchParams.get('pubkey') || ''
      return this.getMyStatus(pubkey)
    })
    // --- Migration Management (Epic 286) ---
    registerMigrationRoutes(this.router, () => this.ctx.storage, 'shifts')

    // Demo mode only — Epic 258 C3
    this.router.post('/reset', async () => {
      if (this.env.DEMO_MODE !== 'true') {
        return new Response('Reset not allowed outside demo mode', { status: 403 })
      }
      await this.ctx.storage.deleteAll()
      return Response.json({ ok: true })
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'shifts')
      this.migrated = true
    }
    // Schedule shift reminder alarm if not already set (Epic 86)
    await this.ensureAlarm()
    return this.router.handle(request)
  }

  /**
   * Alarm handler — checks for shifts starting soon and sends push reminders.
   * Runs every 5 minutes.
   */
  override async alarm(): Promise<void> {
    await this.sendShiftReminders()
    // Re-schedule next alarm in 5 minutes
    await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
  }

  private async ensureAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm()
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    }
  }

  /**
   * Check for shifts starting within 15 minutes and send push reminders.
   * Tracks which reminders have been sent to avoid duplicates.
   */
  private async sendShiftReminders(): Promise<void> {
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    if (shifts.length === 0) return

    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()

    // Track sent reminders: key is "shiftId:day:startTime:date"
    const sentKey = `push-reminders:${now.toISOString().slice(0, 10)}`
    const sentRemindersArr = await this.ctx.storage.get<string[]>(sentKey) || []
    const sentReminders = new Set(sentRemindersArr)
    let changed = false

    const identityDO = this.env.IDENTITY_DO.get(this.env.IDENTITY_DO.idFromName('global-identity'))
    const selfStub = this.env.SHIFT_MANAGER.get(this.env.SHIFT_MANAGER.idFromName('global-shifts'))
    const dispatcher = createPushDispatcher(this.env, identityDO, selfStub)

    for (const shift of shifts) {
      if (!shift.days.includes(currentDay)) continue

      const [h, m] = shift.startTime.split(':').map(Number)
      const shiftStartMinutes = h * 60 + m

      // Check if shift starts within 10–15 minutes
      let minutesUntilStart = shiftStartMinutes - currentMinutes
      if (minutesUntilStart < 0) minutesUntilStart += 24 * 60 // next occurrence

      if (minutesUntilStart > 0 && minutesUntilStart <= 15) {
        const reminderKey = `${shift.id}:${currentDay}:${shift.startTime}`
        if (sentReminders.has(reminderKey)) continue

        // Send push reminder to each volunteer in the shift
        for (const pubkey of shift.volunteerPubkeys) {
          await dispatcher.sendToVolunteer(pubkey, {
            type: 'shift_reminder',
            shiftId: shift.id,
            startsAt: shift.startTime,
          }, {
            type: 'shift_reminder',
            shiftId: shift.id,
            startsAt: shift.startTime,
            shiftName: shift.name,
          }).catch((e) => {
            console.error(`[shift-manager] Push reminder failed for volunteer ${pubkey.slice(0, 8)}:`, e)
          })
        }

        sentReminders.add(reminderKey)
        changed = true
      }
    }

    if (changed) {
      await this.ctx.storage.put(sentKey, Array.from(sentReminders))
    }

    // Clean up old reminder tracking (older than yesterday)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayKey = `push-reminders:${yesterday.toISOString().slice(0, 10)}`
    await this.ctx.storage.delete(yesterdayKey)
  }

  private async getShifts(): Promise<Response> {
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    return Response.json({ shifts })
  }

  private async createShift(data: Omit<Shift, 'id' | 'createdAt'>): Promise<Response> {
    if (!isValidTimeFormat(data.startTime) || !isValidTimeFormat(data.endTime)) {
      return Response.json({ error: 'Invalid time format — expected HH:MM (00:00–23:59)' }, { status: 400 })
    }
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    const shift: Shift = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    shifts.push(shift)
    await this.ctx.storage.put('shifts', shifts)
    return Response.json({ shift })
  }

  private async updateShift(id: string, data: Partial<Shift>): Promise<Response> {
    if ((data.startTime && !isValidTimeFormat(data.startTime)) ||
        (data.endTime && !isValidTimeFormat(data.endTime))) {
      return Response.json({ error: 'Invalid time format — expected HH:MM (00:00–23:59)' }, { status: 400 })
    }
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    const idx = shifts.findIndex(s => s.id === id)
    if (idx === -1) return new Response('Not found', { status: 404 })
    shifts[idx] = { ...shifts[idx], ...data, id } // Don't change id
    await this.ctx.storage.put('shifts', shifts)
    return Response.json({ shift: shifts[idx] })
  }

  private async deleteShift(id: string): Promise<Response> {
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    await this.ctx.storage.put('shifts', shifts.filter(s => s.id !== id))
    return Response.json({ ok: true })
  }

  /**
   * Returns the list of volunteer pubkeys who should be on shift right now.
   * Based on current time and day of week.
   */
  private async getCurrentVolunteers(): Promise<Response> {
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`

    const activeVolunteers = new Set<string>()

    for (const shift of shifts) {
      if (!shift.days.includes(currentDay)) continue

      // Handle shifts that cross midnight
      const startsBeforeEnds = shift.startTime <= shift.endTime

      let isActive: boolean
      if (startsBeforeEnds) {
        isActive = currentTime >= shift.startTime && currentTime < shift.endTime
      } else {
        // Crosses midnight: e.g., 22:00 - 06:00
        isActive = currentTime >= shift.startTime || currentTime < shift.endTime
      }

      if (isActive) {
        for (const pubkey of shift.volunteerPubkeys) {
          activeVolunteers.add(pubkey)
        }
      }
    }

    return Response.json({ volunteers: Array.from(activeVolunteers) })
  }

  /**
   * Returns the shift status for a specific volunteer:
   * - Whether they're currently on shift
   * - Their current shift details (if on shift)
   * - Their next upcoming shift (if any)
   */
  private async getMyStatus(pubkey: string): Promise<Response> {
    const shifts = await this.ctx.storage.get<Shift[]>('shifts') || []
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`

    // Find shifts that include this volunteer
    const myShifts = shifts.filter(s => s.volunteerPubkeys.includes(pubkey))

    // Find current active shift
    let currentShift: { name: string; startTime: string; endTime: string } | null = null
    for (const shift of myShifts) {
      if (!shift.days.includes(currentDay)) continue
      const startsBeforeEnds = shift.startTime <= shift.endTime
      let isActive: boolean
      if (startsBeforeEnds) {
        isActive = currentTime >= shift.startTime && currentTime < shift.endTime
      } else {
        isActive = currentTime >= shift.startTime || currentTime < shift.endTime
      }
      if (isActive) {
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
          const shiftHours = parseInt(shift.startTime.split(':')[0])
          const shiftMins = parseInt(shift.startTime.split(':')[1])
          const shiftMinutes = shiftHours * 60 + shiftMins

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

    return Response.json({
      onShift: currentShift !== null,
      currentShift,
      nextShift,
    })
  }
}
