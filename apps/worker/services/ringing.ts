import type { Env } from '../types'
import type { Services } from '../services'
import { getTelephonyFromService, getHubTelephonyFromService } from '../lib/service-factories'
import { dispatchVoipPushFromService } from '../lib/voip-push'
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_CALL_RING } from '@shared/nostr-events'
import { createLogger } from '../lib/logger'
import { withRetry, isRetryableError } from '../lib/retry'
import { getCircuitBreaker } from '../lib/circuit-breaker'
import { incCounter } from '../routes/metrics'

const logger = createLogger('ringing')

export async function startParallelRinging(
  callSid: string,
  callerNumber: string,
  origin: string,
  env: Env,
  services: Services,
  hubId?: string,
) {
  try {
    // Get on-shift volunteers
    let onShiftPubkeys = await services.shifts.getCurrentVolunteers(hubId ?? '')

    // If no one is on shift, use fallback group
    if (onShiftPubkeys.length === 0) {
      const fallback = await services.settings.getFallbackGroup()
      onShiftPubkeys = fallback.userPubkeys
    }

    logger.info('Parallel ringing started', { callSid, onShiftCount: onShiftPubkeys.length })

    if (onShiftPubkeys.length === 0) {
      logger.info('No volunteers on shift or in fallback — skipping')
      return
    }

    // Get user details (including call preference)
    const { users: allUsers } = await services.identity.getUsers()

    // All available on-shift users (for Nostr relay notification)
    const available = allUsers
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
      logger.info('No available volunteers — skipping')
      return
    }

    logger.info('Ringing volunteers', { callSid, total: available.length, phone: toRingPhone.length, browserVoip: browserVoip.length })

    // Register the incoming call
    await services.calls.addCall(hubId ?? '', {
      callId: callSid,
      callerNumber,
      callerLast4: callerNumber.slice(-4),
      status: 'ringing',
    })

    // Publish call ring event to Nostr relay
    publishNostrEvent(env, KIND_CALL_RING, {
      type: 'call:ring',
      callId: callSid,
    }).catch((e) => { console.error('[ringing] Failed to publish event:', e) })

    // Dispatch VoIP push notifications to mobile volunteers with registered VoIP tokens.
    const callerLast4 = callerNumber.slice(-4)
    dispatchVoipPushFromService(
      browserVoip.map(v => v.pubkey),
      callSid,
      callerLast4,
      env,
      services.identity,
    ).catch(err => {
      // VoIP push is best-effort — Nostr relay is the primary notification path
      console.error('[ringing] VoIP push dispatch failed:', err)
    })

    // Ring phone volunteers via telephony adapter (skip if no one needs phone ringing)
    if (toRingPhone.length > 0) {
      const adapter = hubId
        ? await getHubTelephonyFromService(env, services.settings, hubId)
        : await getTelephonyFromService(env, services.settings)
      if (!adapter) return

      const breaker = getCircuitBreaker({
        name: 'telephony:ringVolunteers',
        failureThreshold: 5,
        resetTimeoutMs: 30_000,
      })

      await breaker.execute(() =>
        withRetry(
          () => adapter.ringVolunteers({
            callSid,
            callerNumber,
            volunteers: toRingPhone,
            callbackUrl: origin,
            hubId,
          }),
          {
            maxAttempts: 3,
            baseDelayMs: 500,
            maxDelayMs: 3000,
            isRetryable: isRetryableError,
            onRetry: (attempt, error) => {
              console.warn(`[ringing] ringVolunteers retry ${attempt} for callSid=${callSid}:`, error)
              incCounter('llamenos_retry_attempts_total', { service: 'telephony', operation: 'ringVolunteers' })
            },
          },
        )
      )
    }
  } catch (err) {
    console.error('[ringing] startParallelRinging failed:', err)
  }
}
