import type { Env } from '../types'
import type { DurableObjects } from '../lib/do-access'
import { getTelephony, getHubTelephony } from '../lib/do-access'
import { dispatchVoipPush } from '../lib/voip-push'

export async function startParallelRinging(
  callSid: string,
  callerNumber: string,
  origin: string,
  env: Env,
  dos: DurableObjects,
  hubId?: string,
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

    // All available on-shift volunteers (for Nostr relay notification)
    const available = allVolunteers
      .filter(v => onShiftPubkeys.includes(v.pubkey) && v.active && !v.onBreak)

    // Only ring phones for volunteers with phone or both preference (and who have a phone number)
    const toRingPhone = available
      .filter(v => {
        const pref = v.callPreference ?? 'phone'
        return (pref === 'phone' || pref === 'both') && v.phone
      })
      .map(v => ({ pubkey: v.pubkey, phone: v.phone }))

    // Browser/VoIP volunteers get notified via Nostr relay and VoIP push
    const browserVoip = available.filter(v => {
      const pref = v.callPreference ?? 'phone'
      return pref === 'browser' || pref === 'both'
    })

    if (available.length === 0) {
      console.log('[ringing] no available volunteers — skipping')
      return
    }

    console.log(`[ringing] callSid=${callSid} total=${available.length} phone=${toRingPhone.length} browser/voip=${browserVoip.length}`)

    // Notify CallRouter DO of the incoming call (all available volunteers for Nostr relay)
    await dos.calls.fetch(new Request('http://do/calls/incoming', {
      method: 'POST',
      body: JSON.stringify({
        callSid,
        callerNumber,
        volunteerPubkeys: available.map(v => v.pubkey),
      }),
    }))

    // Dispatch VoIP push notifications to mobile volunteers with registered VoIP tokens.
    // This wakes the native Linphone SDK which shows CallKit (iOS) or
    // ConnectionService notification (Android) before JS context starts.
    const callerLast4 = callerNumber.slice(-4)
    dispatchVoipPush(
      browserVoip.map(v => v.pubkey),
      callSid,
      callerLast4,
      env,
      dos,
    ).catch(err => {
      // VoIP push is best-effort — Nostr relay is the primary notification path
      console.error('[ringing] VoIP push dispatch failed:', err)
    })

    // Ring phone volunteers via telephony adapter (skip if no one needs phone ringing)
    if (toRingPhone.length > 0) {
      const adapter = hubId
        ? await getHubTelephony(env, hubId)
        : await getTelephony(env, dos)
      if (!adapter) return
      await adapter.ringVolunteers({
        callSid,
        callerNumber,
        volunteers: toRingPhone,
        callbackUrl: origin,
        hubId,
      })
    }
  } catch (err) {
    console.error('[ringing] startParallelRinging failed:', err)
  }
}
