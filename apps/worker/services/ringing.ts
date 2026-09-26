import type { Env } from '../types'
import type { Services } from '../services'
import { getTelephonyFromService, getHubTelephonyFromService } from '../lib/service-factories'
import { dispatchVoipPushFromService } from '../lib/voip-push'
import { publishEvent } from '../lib/ws-events'
import { KIND_CALL_RING } from '@shared/event-kinds'
import { createLogger } from '../lib/logger'
import { withRetry, isRetryableError } from '../lib/retry'
import { getCircuitBreaker } from '../lib/circuit-breaker'
import { incCounter } from '../routes/metrics'
import { hashPhone } from '../lib/crypto'
import { resolveHubPermissions } from '@shared/permissions'

const logger = createLogger('ringing')

/** Outcome of a ringing attempt — `ringing: false` means no call record was created. */
export interface ParallelRingingResult {
  ringing: boolean
  /** Why nothing rang (only set when `ringing` is false). */
  reason?: 'no-volunteers' | 'no-available-volunteers' | 'error'
  /** Number of available on-shift volunteers notified (relay / VoIP push / phone). */
  volunteersNotified: number
}

type RingableUser = Awaited<ReturnType<Services['identity']['getUsers']>>['users'][number]

/**
 * Resolve the volunteers a call for this hub rings: on-shift (or the hub's
 * fallback group when nobody is on shift), filtered to those who are active,
 * not on break, and have access to the hub. If every on-shift volunteer is unavailable the fallback group is
 * tried with the same rules.
 *
 * Shared by the ringing path and the answer path so "who may answer" can never
 * drift from "who was rung". Returns null when there is no roster at all;
 * `available` is empty when a roster exists but nobody is available.
 */
export async function resolveRingableVolunteers(
  services: Services,
  hubId: string,
): Promise<{ available: RingableUser[] } | null> {
  let onShiftPubkeys = await services.shifts.getCurrentVolunteers(hubId)
  let usedFallback = false

  // If no one is on shift, use the hub's fallback group
  if (onShiftPubkeys.length === 0) {
    const fallback = await services.settings.getFallbackGroup(hubId)
    onShiftPubkeys = fallback.userPubkeys
    usedFallback = true
  }

  logger.info('Resolving ringable volunteers', { hubId, onShiftCount: onShiftPubkeys.length })

  if (onShiftPubkeys.length === 0) return null

  const { users: allUsers } = await services.identity.getUsers()

  // Hub access: only ring people who could actually answer this hub's call.
  // Same rule `hubContext` applies to the answer route — any effective permission in
  // the hub (global role or hub-scoped role). Without this a stale shift entry or a
  // fallback group naming a user from another hub would push "a caller is waiting"
  // to someone with no business in this hub. Global-scope calls (hubId '') have no hub.
  const { roles: allRoles } = hubId !== '' ? await services.settings.getRoles() : { roles: [] }
  const hasHubAccess = (v: RingableUser) =>
    hubId === '' || resolveHubPermissions(v.roles ?? [], v.hubRoles ?? [], allRoles, hubId).length > 0

  // Availability rules: a volunteer must be active, not on break, and a member of the hub.
  const pickAvailable = (pubkeys: string[]) =>
    allUsers.filter(v => pubkeys.includes(v.pubkey) && v.active && !v.onBreak && hasHubAccess(v))

  let available = pickAvailable(onShiftPubkeys)

  // Everyone on shift is unavailable (inactive / on break) — try the fallback
  // group with the same availability rules before giving up. The fallback is
  // meant for exactly this case, not only for an empty roster.
  if (available.length === 0 && !usedFallback) {
    const fallback = await services.settings.getFallbackGroup(hubId)
    available = pickAvailable(fallback.userPubkeys)
    logger.info('On-shift volunteers unavailable — tried fallback group', {
      hubId,
      fallbackCount: fallback.userPubkeys.length,
      fallbackAvailable: available.length,
    })
  }

  return { available }
}

// ---------------------------------------------------------------------------
// Ring-leg registry (first-pickup-wins)
// ---------------------------------------------------------------------------

/** Legs older than this are dropped — matches the ringing-call staleness TTL. */
const RING_LEG_TTL_MS = 3 * 60 * 1000

/**
 * Provider call SIDs of the phone legs rung for a call, keyed by parent call SID.
 *
 * Process-local: the ring and the answer webhooks are served by the same server
 * process. After a restart the registry is empty, so the losing legs simply ring
 * out (30s provider timeout) — they can no longer win the call, because the
 * answer itself is an atomic conditional update (see CallsService.answerCall).
 * Durable storage needs a new column on active_calls (a drizzle migration).
 */
const ringLegs = new Map<string, { legSids: string[]; recordedAt: number }>()

function pruneRingLegs(now: number): void {
  for (const [callSid, entry] of ringLegs) {
    if (now - entry.recordedAt > RING_LEG_TTL_MS) ringLegs.delete(callSid)
  }
}

export function recordRingLegs(callSid: string, legSids: string[]): void {
  const now = Date.now()
  pruneRingLegs(now)
  if (legSids.length > 0) ringLegs.set(callSid, { legSids, recordedAt: now })
}

/** Remove and return the recorded legs for a call (each call is answered at most once). */
export function takeRingLegs(callSid: string): string[] {
  pruneRingLegs(Date.now())
  const entry = ringLegs.get(callSid)
  ringLegs.delete(callSid)
  return entry?.legSids ?? []
}

/**
 * After a successful answer, stop every other phone leg still ringing.
 * `winnerLegSid` is the leg that answered (undefined for an in-app answer, where
 * every phone leg is a loser). Best-effort: the answer already won atomically,
 * so a provider failure here must not fail the answer.
 */
export async function cancelLosingLegs(
  env: Env,
  services: Services,
  hubId: string,
  callSid: string,
  winnerLegSid?: string,
): Promise<void> {
  const legSids = takeRingLegs(callSid)
  if (legSids.length === 0) return
  try {
    const adapter = hubId !== ''
      ? await getHubTelephonyFromService(env, services.settings, hubId)
      : await getTelephonyFromService(env, services.settings)
    if (!adapter) return
    await adapter.cancelRinging(legSids, winnerLegSid)
  } catch (err) {
    logger.error('Failed to cancel losing ring legs', err, { callSid })
  }
}

export async function startParallelRinging(
  callSid: string,
  callerNumber: string,
  origin: string,
  env: Env,
  services: Services,
  hubId: string,
): Promise<ParallelRingingResult> {
  try {
    const resolved = await resolveRingableVolunteers(services, hubId)
    if (!resolved) {
      logger.info('No volunteers on shift or in fallback — skipping')
      return { ringing: false, reason: 'no-volunteers', volunteersNotified: 0 }
    }
    const { available } = resolved

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
      // A caller is waiting with no one to answer — this must be loud.
      logger.error('No available volunteers on shift or in fallback group — caller will get no answer', { callSid, hubId })
      return { ringing: false, reason: 'no-available-volunteers', volunteersNotified: 0 }
    }

    logger.info('Ringing volunteers', { callSid, total: available.length, phone: toRingPhone.length, browserVoip: browserVoip.length })

    // Register the incoming call — store HMAC hash, not the raw number
    const callerNumberHash = hashPhone(callerNumber, env.HMAC_SECRET)
    await services.calls.addCall(hubId, {
      callId: callSid,
      callerNumber: callerNumberHash,
      callerLast4: callerNumber.slice(-4),
      status: 'ringing',
    })

    // Publish call ring event to Nostr relay
    publishEvent(env, KIND_CALL_RING, {
      type: 'call:ring',
      callId: callSid,
    })

    // Dispatch VoIP push notifications to mobile volunteers with registered VoIP tokens.
    // Skip VoIP push for global-scope (hubId='') calls — mobile clients require a real hub ID to route the call.
    const callerLast4 = callerNumber.slice(-4)
    if (hubId !== '') {
      dispatchVoipPushFromService(
        browserVoip.map(v => v.pubkey),
        callSid,
        callerLast4,
        hubId,
        env,
        services.identity,
      ).catch(err => {
        // VoIP push is best-effort — Nostr relay is the primary notification path
        logger.error('VoIP push dispatch failed', err)
      })
    }

    // Ring phone volunteers via telephony adapter (skip if no one needs phone ringing)
    if (toRingPhone.length > 0) {
      const adapter = hubId !== ''
        ? await getHubTelephonyFromService(env, services.settings, hubId)
        : await getTelephonyFromService(env, services.settings)
      if (!adapter) return { ringing: true, volunteersNotified: available.length }

      // CRIT-W2: Generate opaque single-use call tokens per volunteer.
      // Tokens are embedded in callback URLs instead of raw pubkeys.
      // Filter out any volunteers with missing pubkeys — creating tokens
      // with empty pubkeys would break callback resolution.
      const ringableVolunteers = toRingPhone.filter(vol => vol.pubkey)
      const volunteersWithTokens = await Promise.all(
        ringableVolunteers.map(async (vol) => {
          const callToken = await services.calls.createCallToken({
            callSid,
            volunteerPubkey: vol.pubkey,
            hubId,
          })
          return { phone: vol.phone as string, callToken }
        }),
      )

      if (volunteersWithTokens.length === 0) return { ringing: true, volunteersNotified: available.length }

      const breaker = getCircuitBreaker({
        name: 'telephony:ringVolunteers',
        failureThreshold: 5,
        resetTimeoutMs: 30_000,
      })

      const legSids = await breaker.execute(() =>
        withRetry(
          () => adapter.ringVolunteers({
            callSid,
            callerNumber,
            volunteers: volunteersWithTokens,
            callbackUrl: origin,
            hubId,
          }),
          {
            maxAttempts: 3,
            baseDelayMs: 500,
            maxDelayMs: 3000,
            isRetryable: isRetryableError,
            onRetry: (attempt, error) => {
              logger.warn(`ringVolunteers retry ${attempt} for callSid=${callSid}`, { error })
              incCounter('llamenos_retry_attempts_total', { service: 'telephony', operation: 'ringVolunteers' })
            },
          },
        )
      )
      recordRingLegs(callSid, legSids)
    }
    return { ringing: true, volunteersNotified: available.length }
  } catch (err) {
    logger.error('startParallelRinging failed', err)
    return { ringing: false, reason: 'error', volunteersNotified: 0 }
  }
}
