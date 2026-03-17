import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getTelephonyFromService, getHubTelephonyFromService } from '../lib/do-access'
import type { TelephonyAdapter } from '../telephony/adapter'
import type { Services } from '../services'
import type { Env } from '../types'
import { buildAudioUrlMap, telephonyResponse } from '../lib/helpers'
import { hashPhone } from '../lib/crypto'
import { detectLanguageFromPhone, languageFromDigit, DEFAULT_LANGUAGE } from '@shared/languages'
import { audit } from '../services/audit'
import { startParallelRinging } from '../services/ringing'
import { maybeTranscribe, transcribeVoicemail } from '../services/transcription'
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_CALL_UPDATE, KIND_CALL_VOICEMAIL, KIND_PRESENCE_UPDATE } from '@shared/nostr-events'
import { createLogger } from '../lib/logger'

const logger = createLogger('telephony')

const telephony = new Hono<AppEnv>()

/**
 * Resolve hub-scoped services and telephony adapter from a hub query param.
 */
async function getHubAdapter(env: Env, services: Services, hubId: string | undefined): Promise<TelephonyAdapter | null> {
  if (hubId) {
    return getHubTelephonyFromService(env, services.settings, hubId)
  }
  return getTelephonyFromService(env, services.settings)
}

// Validate telephony webhook signature on all routes
telephony.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  logger.debug('Webhook received', { method: c.req.method, path: url.pathname, search: url.search })
  const env = c.env
  const services = c.get('services')

  // For /incoming, we don't know the hub yet — use global adapter for validation
  // For all other routes, hub is in query params
  const hubId = url.searchParams.get('hub') || undefined
  const adapter = await getHubAdapter(env, services, hubId)

  // If no telephony provider is configured, return a helpful error
  if (!adapter) {
    return c.json({
      error: 'Telephony is not configured. Set up a voice provider in Admin Settings or the Setup Wizard.',
    }, 404)
  }

  const isDev = env.ENVIRONMENT === 'development'
  // Epic 258 C7: Only trust CF-Connecting-IP, never controllable hostname
  const isLocal = isDev && c.req.header('CF-Connecting-IP') === '127.0.0.1'
  if (!isLocal) {
    const isValid = await adapter.validateWebhook(c.req.raw)
    if (!isValid) {
      console.error(`[telephony] Webhook signature FAILED for ${url.pathname}`)
      return new Response('Forbidden', { status: 403 })
    }
  }
  await next()
})

// --- Step 1: Incoming call -> hub lookup -> ban check -> language menu ---
telephony.post('/incoming', async (c) => {
  const services = c.get('services')
  const globalAdapter = (await getTelephonyFromService(c.env, services.settings))!
  const { callSid, callerNumber, calledNumber } = await globalAdapter.parseIncomingWebhook(c.req.raw)
  logger.info('Incoming call', { callSid, callerLast4: callerNumber.slice(-4), calledNumber: calledNumber || 'unknown' })

  // Look up which hub owns the called phone number
  let hubId: string | undefined
  if (calledNumber) {
    try {
      const { hub } = await services.settings.getHubByPhone(calledNumber)
      hubId = hub.id
      logger.info('Resolved hub for incoming call', { hubId, calledNumber })
    } catch {
      // No hub found for this number
    }
  }

  // Use hub-scoped adapter for all subsequent operations
  const adapter = hubId ? ((await getHubTelephonyFromService(c.env, services.settings, hubId)) ?? globalAdapter) : globalAdapter

  const banned = await services.records.checkBan(callerNumber, hubId)
  if (banned) {
    return telephonyResponse(adapter.rejectCall())
  }

  const { enabledLanguages } = await services.settings.getIvrLanguages()

  const response = await adapter.handleLanguageMenu({
    callSid,
    callerNumber,
    hotlineName: c.env.HOTLINE_NAME || 'Llamenos',
    enabledLanguages,
    hubId,
  })
  return telephonyResponse(response)
})

// --- Step 2: Language selected -> spam check -> greeting + hold/captcha ---
telephony.post('/language-selected', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const { callSid, callerNumber, digits } = await adapter.parseLanguageWebhook(c.req.raw)
  const isAuto = url.searchParams.get('auto') === '1'

  let callerLanguage: string
  const forceLang = url.searchParams.get('forceLang')
  if (forceLang) {
    callerLanguage = forceLang
  } else if (isAuto) {
    callerLanguage = detectLanguageFromPhone(callerNumber)
  } else {
    callerLanguage = languageFromDigit(digits) ?? detectLanguageFromPhone(callerNumber)
  }

  const spamSettings = await services.settings.getSpamSettings()

  let rateLimited = false
  if (spamSettings.rateLimitEnabled) {
    const rlResult = await services.settings.checkRateLimit({
      key: `phone:${hashPhone(callerNumber, c.env.HMAC_SECRET)}`,
      maxPerMinute: spamSettings.maxCallsPerMinute,
    })
    rateLimited = rlResult.limited
  }

  // Generate CAPTCHA digits server-side with CSPRNG and store them
  let captchaDigits: string | undefined
  if (spamSettings.voiceCaptchaEnabled && !rateLimited) {
    const buf = new Uint8Array(2)
    crypto.getRandomValues(buf)
    captchaDigits = String(1000 + (((buf[0] << 8) | buf[1]) % 9000))
    // Store expected digits server-side (not in callback URL)
    await services.settings.storeCaptcha({ callSid, expected: captchaDigits })
  }

  const audioUrls = await buildAudioUrlMap(services.settings, new URL(c.req.url).origin)
  const response = await adapter.handleIncomingCall({
    callSid,
    callerNumber,
    voiceCaptchaEnabled: spamSettings.voiceCaptchaEnabled,
    rateLimited,
    callerLanguage,
    hotlineName: c.env.HOTLINE_NAME || 'Llamenos',
    audioUrls,
    captchaDigits,
    hubId,
  })

  if (!rateLimited && !spamSettings.voiceCaptchaEnabled) {
    const origin = new URL(c.req.url).origin
    logger.info('Starting parallel ringing', { callSid, origin, hubId: hubId || 'global' })
    c.executionCtx.waitUntil(startParallelRinging(callSid, callerNumber, origin, c.env, services, hubId))
  }

  return telephonyResponse(response)
})

// --- Step 3: CAPTCHA response ---
telephony.post('/captcha', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const { digits, callerNumber } = await adapter.parseCaptchaWebhook(c.req.raw)
  const callSid = url.searchParams.get('callSid') || ''
  const callerLang = url.searchParams.get('lang') || DEFAULT_LANGUAGE

  // Look up expected digits from server-side storage (not URL params)
  const { match, expected } = await services.settings.verifyCaptcha({ callSid, digits })

  const response = await adapter.handleCaptchaResponse({ callSid, digits, expectedDigits: expected, callerLanguage: callerLang, hubId })

  if (match) {
    const origin = new URL(c.req.url).origin
    c.executionCtx.waitUntil(startParallelRinging(callSid, callerNumber, origin, c.env, services, hubId))
  }

  return telephonyResponse(response)
})

// --- Step 4: Volunteer answered -> bridge via queue ---
telephony.post('/volunteer-answer', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const parentCallSid = url.searchParams.get('parentCallSid') || ''
  const pubkey = url.searchParams.get('pubkey') || ''

  await services.calls.answerCall(hubId ?? '', parentCallSid, pubkey)

  // Publish call answered event + presence update
  publishNostrEvent(c.env, KIND_CALL_UPDATE, {
    type: 'call:update',
    callId: parentCallSid,
    status: 'in-progress',
  }).catch((e) => { console.error('[telephony] Failed to publish call update:', e) })

  publishNostrEvent(c.env, KIND_PRESENCE_UPDATE, {
    type: 'presence:summary',
    callId: parentCallSid,
  }).catch((e) => { console.error('[telephony] Failed to publish presence update:', e) })

  const [volInfo, activeCalls] = await Promise.all([
    services.identity.getVolunteer(pubkey).catch(() => ({} as { name?: string })),
    services.calls.getActiveCalls(hubId ?? ''),
  ])
  const callRecord = activeCalls.find(call => call.callId === parentCallSid)
  await audit(services.audit, 'callAnswered', pubkey, {
    callerLast4: callRecord?.callerLast4 || '',
  })

  const origin = new URL(c.req.url).origin
  const response = await adapter.handleCallAnswered({ parentCallSid, callbackUrl: origin, volunteerPubkey: pubkey, hubId })
  return telephonyResponse(response)
})

// --- Step 5: Call status callback ---
telephony.post('/call-status', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const { status: callStatus } = await adapter.parseCallStatusWebhook(c.req.raw)
  const parentCallSid = url.searchParams.get('parentCallSid') || ''

  logger.info('Call status update', { status: callStatus, parentCallSid, hubId: hubId || 'global' })

  if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed') {
    const pubkey = url.searchParams.get('pubkey') || ''
    if (callStatus === 'completed') {
      const preCalls = await services.calls.getActiveCalls(hubId ?? '')
      const preCall = preCalls.find(call => call.callId === parentCallSid)
      logger.debug('Ending call', { parentCallSid, foundInActive: !!preCall })

      try {
        await services.calls.endCall(hubId ?? '', parentCallSid)
        logger.debug('Call end result', { parentCallSid, status: 200 })

        // Publish call completed event
        publishNostrEvent(c.env, KIND_CALL_UPDATE, {
          type: 'call:update',
          callId: parentCallSid,
          status: 'completed',
        }).catch((e) => { console.error('[telephony] Failed to publish call end:', e) })

        const duration = preCall
          ? Math.floor((Date.now() - new Date(preCall.startedAt).getTime()) / 1000)
          : undefined
        await audit(services.audit, 'callEnded', pubkey, {
          callerLast4: preCall?.callerLast4 || '',
          duration,
        })
      } catch {
        logger.debug('Call end result', { parentCallSid, status: 404 })
        // Already ended by /call-recording
      }
    }
  }

  return telephonyResponse(adapter.emptyResponse())
})

// --- Step 6: Wait music for queued callers ---
telephony.all('/wait-music', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const lang = url.searchParams.get('lang') || DEFAULT_LANGUAGE
  const queueTime = c.req.method === 'POST'
    ? (await adapter.parseQueueWaitWebhook(c.req.raw)).queueTime
    : 0
  const audioUrls = await buildAudioUrlMap(services.settings, new URL(c.req.url).origin)
  const callSettings = await services.settings.getCallSettings()
  const response = await adapter.handleWaitMusic(lang, audioUrls, queueTime, callSettings.queueTimeoutSeconds)
  return telephonyResponse(response)
})

// --- Step 7: Queue exit -> voicemail if no one answered ---
telephony.post('/queue-exit', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const { result: queueResult } = await adapter.parseQueueExitWebhook(c.req.raw)
  const callSid = url.searchParams.get('callSid') || ''
  const lang = url.searchParams.get('lang') || DEFAULT_LANGUAGE

  if (queueResult === 'hangup') {
    // Caller hung up while in queue — end the call as unanswered
    try { await services.calls.endCall(hubId ?? '', callSid) } catch { /* already ended */ }
    await audit(services.audit, 'callMissed', 'system', { callSid })
    return telephonyResponse(adapter.emptyResponse())
  }

  if (queueResult === 'leave' || queueResult === 'queue-full' || queueResult === 'error') {
    const audioUrls = await buildAudioUrlMap(services.settings, new URL(c.req.url).origin)
    const origin = new URL(c.req.url).origin
    const callSettings = await services.settings.getCallSettings()
    const response = await adapter.handleVoicemail({
      callSid,
      callerLanguage: lang,
      callbackUrl: origin,
      audioUrls,
      maxRecordingSeconds: callSettings.voicemailMaxSeconds,
      hubId,
    })
    return telephonyResponse(response)
  }

  return telephonyResponse(adapter.emptyResponse())
})

// --- Step 8: Voicemail recording complete ---
telephony.post('/voicemail-complete', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const lang = url.searchParams.get('lang') || DEFAULT_LANGUAGE
  return telephonyResponse(adapter.handleVoicemailComplete(lang))
})

// --- Step 9: Call recording status callback (bridged call recording) ---
telephony.post('/call-recording', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const { status: recordingStatus, recordingSid } = await adapter.parseRecordingWebhook(c.req.raw)
  const parentCallSid = url.searchParams.get('parentCallSid') || ''
  const pubkey = url.searchParams.get('pubkey') || ''

  if (recordingStatus === 'completed' && parentCallSid) {
    // Get call info before ending (for audit)
    const activeCalls = await services.calls.getActiveCalls(hubId ?? '')
    const callRecord = activeCalls.find(call => call.callId === parentCallSid)

    // Recording completed means the bridge ended — end the call
    // (safety net in case /call-status doesn't fire)
    try {
      await services.calls.endCall(hubId ?? '', parentCallSid)
      logger.info('Call recording completed', { parentCallSid, endStatus: 200 })

      if (pubkey) {
        await audit(services.audit, 'callEnded', pubkey, {
          callerLast4: callRecord?.callerLast4 || '',
        })
      }
    } catch {
      logger.info('Call recording completed', { parentCallSid, endStatus: 404 })
    }

    if (recordingSid) {
      c.executionCtx.waitUntil(
        maybeTranscribe(parentCallSid, recordingSid, pubkey, c.env, services)
      )
    }
  }

  return telephonyResponse(adapter.emptyResponse())
})

// --- Step 10: Voicemail recording status callback ---
telephony.post('/voicemail-recording', async (c) => {
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const services = c.get('services')
  const adapter = (await getHubAdapter(c.env, services, hubId))!
  const { status: recordingStatus } = await adapter.parseRecordingWebhook(c.req.raw)
  const callSid = url.searchParams.get('callSid') || ''

  if (recordingStatus === 'completed') {
    await services.calls.markVoicemail(hubId ?? '', callSid)

    // Publish voicemail event
    publishNostrEvent(c.env, KIND_CALL_VOICEMAIL, {
      type: 'voicemail:new',
      callId: callSid,
    }).catch((e) => { console.error('[telephony] Failed to publish voicemail event:', e) })

    await audit(services.audit, 'voicemailReceived', 'system', { callSid }, { request: c.req.raw, hmacSecret: c.env.HMAC_SECRET })

    c.executionCtx.waitUntil(transcribeVoicemail(callSid, c.env, services))
  }

  return telephonyResponse(adapter.emptyResponse())
})

export default telephony
