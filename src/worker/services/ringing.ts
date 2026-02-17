import type { Env } from '../types'
import type { DurableObjects } from '../lib/do-access'
import { getTelephony } from '../lib/do-access'

export async function startParallelRinging(
  callSid: string,
  callerNumber: string,
  origin: string,
  env: Env,
  dos: DurableObjects,
) {
  try {
    // Get on-shift volunteers
    const shiftRes = await dos.shifts.fetch(new Request('http://do/current-volunteers'))
    let { volunteers: onShiftPubkeys } = await shiftRes.json() as { volunteers: string[] }

    // If no one is on shift, use fallback group
    if (onShiftPubkeys.length === 0) {
      const fallbackRes = await dos.settings.fetch(new Request('http://do/fallback'))
      const fallback = await fallbackRes.json() as { volunteers: string[] }
      onShiftPubkeys = fallback.volunteers
    }

    console.log(`[ringing] callSid=${callSid} onShift=${onShiftPubkeys.length}`)

    if (onShiftPubkeys.length === 0) {
      console.log('[ringing] no volunteers on shift or in fallback — skipping')
      return
    }

    // Get volunteer details (including call preference)
    const volRes = await dos.identity.fetch(new Request('http://do/volunteers'))
    const { volunteers: allVolunteers } = await volRes.json() as {
      volunteers: Array<{
        pubkey: string
        phone: string
        active: boolean
        onBreak?: boolean
        callPreference?: 'phone' | 'browser' | 'both'
      }>
    }

    // All available on-shift volunteers (for WebSocket notification)
    const available = allVolunteers
      .filter(v => onShiftPubkeys.includes(v.pubkey) && v.active && !v.onBreak)

    // Only ring phones for volunteers with phone or both preference (and who have a phone number)
    const toRingPhone = available
      .filter(v => {
        const pref = v.callPreference ?? 'phone'
        return (pref === 'phone' || pref === 'both') && v.phone
      })
      .map(v => ({ pubkey: v.pubkey, phone: v.phone }))

    // Browser-only volunteers still get notified via WebSocket (handled by CallRouterDO)
    const browserOnly = available.filter(v => (v.callPreference ?? 'phone') === 'browser')

    if (available.length === 0) {
      console.log('[ringing] no available volunteers — skipping')
      return
    }

    console.log(`[ringing] callSid=${callSid} total=${available.length} phone=${toRingPhone.length} browser=${browserOnly.length}`)

    // Notify CallRouter DO of the incoming call (includes all available volunteers for WebSocket)
    await dos.calls.fetch(new Request('http://do/calls/incoming', {
      method: 'POST',
      body: JSON.stringify({
        callSid,
        callerNumber,
        volunteerPubkeys: available.map(v => v.pubkey),
      }),
    }))

    // Ring phone volunteers via telephony adapter (skip if no one needs phone ringing)
    if (toRingPhone.length > 0) {
      const adapter = await getTelephony(env, dos)
      if (!adapter) return
      await adapter.ringVolunteers({
        callSid,
        callerNumber,
        volunteers: toRingPhone,
        callbackUrl: origin,
      })
    }
  } catch (err) {
    console.error('[ringing] startParallelRinging failed:', err)
  }
}
