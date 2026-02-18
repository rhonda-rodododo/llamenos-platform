import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs, getTelephony } from '../lib/do-access'
import { buildAudioUrlMap, telephonyResponse } from '../lib/helpers'
import { hashPhone } from '../lib/crypto'
import { detectLanguageFromPhone, languageFromDigit, DEFAULT_LANGUAGE } from '../../shared/languages'
import { audit } from '../services/audit'
import { startParallelRinging } from '../services/ringing'
import { maybeTranscribe, transcribeVoicemail } from '../services/transcription'

const telephony = new Hono<AppEnv>()

// Validate telephony webhook signature on all routes
telephony.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  console.log(`[telephony] ${c.req.method} ${url.pathname}${url.search}`)
  const env = c.env
  const dos = getDOs(env)
  const adapter = await getTelephony(env, dos)

  // If no telephony provider is configured, return a helpful error
  if (!adapter) {
    return c.json({
      error: 'Telephony is not configured. Set up a voice provider in Admin Settings or the Setup Wizard.',
    }, 404)
  }

  const isDev = env.ENVIRONMENT === 'development'
  const isLocal = isDev && (c.req.header('CF-Connecting-IP') === '127.0.0.1' || url.hostname === 'localhost')
  if (!isLocal) {
    const isValid = await adapter.validateWebhook(c.req.raw)
    if (!isValid) {
      console.error(`[telephony] Webhook signature FAILED for ${url.pathname}`)
      return new Response('Forbidden', { status: 403 })
    }
  }
  await next()
})

// --- Step 1: Incoming call -> ban check -> language menu ---
telephony.post('/incoming', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { callSid, callerNumber } = await adapter.parseIncomingWebhook(c.req.raw)
  console.log(`[telephony] /incoming callSid=${callSid} caller=***${callerNumber.slice(-4)}`)

  const banCheck = await dos.records.fetch(new Request(`http://do/bans/check/${encodeURIComponent(callerNumber)}`))
  const { banned } = await banCheck.json() as { banned: boolean }
  if (banned) {
    return telephonyResponse(adapter.rejectCall())
  }

  const ivrRes = await dos.settings.fetch(new Request('http://do/settings/ivr-languages'))
  const { enabledLanguages } = await ivrRes.json() as { enabledLanguages: string[] }

  const response = await adapter.handleLanguageMenu({
    callSid,
    callerNumber,
    hotlineName: c.env.HOTLINE_NAME || 'Llámenos',
    enabledLanguages,
  })
  return telephonyResponse(response)
})

// --- Step 2: Language selected -> spam check -> greeting + hold/captcha ---
telephony.post('/language-selected', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { callSid, callerNumber, digits } = await adapter.parseLanguageWebhook(c.req.raw)
  const url = new URL(c.req.url)
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

  const spamRes = await dos.settings.fetch(new Request('http://do/settings/spam'))
  const spamSettings = await spamRes.json() as { voiceCaptchaEnabled: boolean; rateLimitEnabled: boolean; maxCallsPerMinute: number }

  let rateLimited = false
  if (spamSettings.rateLimitEnabled) {
    const rlRes = await dos.settings.fetch(new Request('http://do/rate-limit/check', {
      method: 'POST',
      body: JSON.stringify({ key: `phone:${hashPhone(callerNumber)}`, maxPerMinute: spamSettings.maxCallsPerMinute }),
    }))
    const rlData = await rlRes.json() as { limited: boolean }
    rateLimited = rlData.limited
  }

  // Generate CAPTCHA digits server-side with CSPRNG and store them
  let captchaDigits: string | undefined
  if (spamSettings.voiceCaptchaEnabled && !rateLimited) {
    const buf = new Uint8Array(2)
    crypto.getRandomValues(buf)
    captchaDigits = String(1000 + (((buf[0] << 8) | buf[1]) % 9000))
    // Store expected digits server-side (not in callback URL)
    await dos.settings.fetch(new Request('http://do/captcha/store', {
      method: 'POST',
      body: JSON.stringify({ callSid, expected: captchaDigits }),
    }))
  }

  const audioUrls = await buildAudioUrlMap(dos.settings, new URL(c.req.url).origin)
  const response = await adapter.handleIncomingCall({
    callSid,
    callerNumber,
    voiceCaptchaEnabled: spamSettings.voiceCaptchaEnabled,
    rateLimited,
    callerLanguage,
    hotlineName: c.env.HOTLINE_NAME || 'Llámenos',
    audioUrls,
    captchaDigits,
  })

  if (!rateLimited && !spamSettings.voiceCaptchaEnabled) {
    const origin = new URL(c.req.url).origin
    console.log(`[telephony] /language-selected starting parallel ringing callSid=${callSid} origin=${origin}`)
    c.executionCtx.waitUntil(startParallelRinging(callSid, callerNumber, origin, c.env, dos))
  }

  return telephonyResponse(response)
})

// --- Step 3: CAPTCHA response ---
telephony.post('/captcha', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { digits, callerNumber } = await adapter.parseCaptchaWebhook(c.req.raw)
  const url = new URL(c.req.url)
  const callSid = url.searchParams.get('callSid') || ''
  const callerLang = url.searchParams.get('lang') || DEFAULT_LANGUAGE

  // Look up expected digits from server-side storage (not URL params)
  const captchaRes = await dos.settings.fetch(new Request(`http://do/captcha/verify`, {
    method: 'POST',
    body: JSON.stringify({ callSid, digits }),
  }))
  const { match, expected } = await captchaRes.json() as { match: boolean; expected: string }

  const response = await adapter.handleCaptchaResponse({ callSid, digits, expectedDigits: expected, callerLanguage: callerLang })

  if (match) {
    const origin = new URL(c.req.url).origin
    c.executionCtx.waitUntil(startParallelRinging(callSid, callerNumber, origin, c.env, dos))
  }

  return telephonyResponse(response)
})

// --- Step 4: Volunteer answered -> bridge via queue ---
telephony.post('/volunteer-answer', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const url = new URL(c.req.url)
  const parentCallSid = url.searchParams.get('parentCallSid') || ''
  const pubkey = url.searchParams.get('pubkey') || ''

  await dos.calls.fetch(new Request(`http://do/calls/${parentCallSid}/answer`, {
    method: 'POST',
    body: JSON.stringify({ pubkey }),
  }))

  const [volInfoRes, activeCallsRes] = await Promise.all([
    dos.identity.fetch(new Request(`http://do/volunteer/${pubkey}`)),
    dos.calls.fetch(new Request('http://do/calls/active')),
  ])
  const volInfo = volInfoRes.ok ? await volInfoRes.json() as { name?: string } : {}
  const { calls: activeCalls } = await activeCallsRes.json() as { calls: Array<{ id: string; callerLast4?: string }> }
  const callRecord = activeCalls.find(call => call.id === parentCallSid)
  await audit(dos.records, 'callAnswered', pubkey, {
    callerLast4: callRecord?.callerLast4 || '',
  })

  const origin = new URL(c.req.url).origin
  const response = await adapter.handleCallAnswered({ parentCallSid, callbackUrl: origin, volunteerPubkey: pubkey })
  return telephonyResponse(response)
})

// --- Step 5: Call status callback ---
telephony.post('/call-status', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { status: callStatus } = await adapter.parseCallStatusWebhook(c.req.raw)
  const url = new URL(c.req.url)
  const parentCallSid = url.searchParams.get('parentCallSid') || ''

  console.log(`[call-status] status=${callStatus} parentCallSid=${parentCallSid}`)

  if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed') {
    const pubkey = url.searchParams.get('pubkey') || ''
    if (callStatus === 'completed') {
      const preCallRes = await dos.calls.fetch(new Request('http://do/calls/active'))
      const { calls: preCalls } = await preCallRes.json() as { calls: Array<{ id: string; callerLast4?: string; startedAt: string }> }
      const preCall = preCalls.find(call => call.id === parentCallSid)
      console.log(`[call-status] ending call ${parentCallSid}, found in active: ${!!preCall}`)

      const endRes = await dos.calls.fetch(new Request(`http://do/calls/${parentCallSid}/end`, { method: 'POST' }))
      console.log(`[call-status] end result: ${endRes.status}`)

      // Only audit if we actually ended the call (not already ended by /call-recording)
      if (endRes.status === 200) {
        const duration = preCall
          ? Math.floor((Date.now() - new Date(preCall.startedAt).getTime()) / 1000)
          : undefined
        await audit(dos.records, 'callEnded', pubkey, {
          callerLast4: preCall?.callerLast4 || '',
          duration,
        })
      }
    }
  }

  return telephonyResponse(adapter.emptyResponse())
})

// --- Step 6: Wait music for queued callers ---
telephony.all('/wait-music', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const url = new URL(c.req.url)
  const lang = url.searchParams.get('lang') || DEFAULT_LANGUAGE
  const queueTime = c.req.method === 'POST'
    ? (await adapter.parseQueueWaitWebhook(c.req.raw)).queueTime
    : 0
  const audioUrls = await buildAudioUrlMap(dos.settings, new URL(c.req.url).origin)
  const callSettingsRes = await dos.settings.fetch(new Request('http://do/settings/call'))
  const callSettings = await callSettingsRes.json() as { queueTimeoutSeconds: number; voicemailMaxSeconds: number }
  const response = await adapter.handleWaitMusic(lang, audioUrls, queueTime, callSettings.queueTimeoutSeconds)
  return telephonyResponse(response)
})

// --- Step 7: Queue exit -> voicemail if no one answered ---
telephony.post('/queue-exit', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { result: queueResult } = await adapter.parseQueueExitWebhook(c.req.raw)
  const url = new URL(c.req.url)
  const callSid = url.searchParams.get('callSid') || ''
  const lang = url.searchParams.get('lang') || DEFAULT_LANGUAGE

  if (queueResult === 'hangup') {
    // Caller hung up while in queue — end the call as unanswered
    await dos.calls.fetch(new Request(`http://do/calls/${callSid}/end`, { method: 'POST' }))
    await audit(dos.records, 'callMissed', 'system', { callSid })
    return telephonyResponse(adapter.emptyResponse())
  }

  if (queueResult === 'leave' || queueResult === 'queue-full' || queueResult === 'error') {
    const audioUrls = await buildAudioUrlMap(dos.settings, new URL(c.req.url).origin)
    const origin = new URL(c.req.url).origin
    const callSettingsRes = await dos.settings.fetch(new Request('http://do/settings/call'))
    const callSettings = await callSettingsRes.json() as { queueTimeoutSeconds: number; voicemailMaxSeconds: number }
    const response = await adapter.handleVoicemail({
      callSid,
      callerLanguage: lang,
      callbackUrl: origin,
      audioUrls,
      maxRecordingSeconds: callSettings.voicemailMaxSeconds,
    })
    return telephonyResponse(response)
  }

  return telephonyResponse(adapter.emptyResponse())
})

// --- Step 8: Voicemail recording complete ---
telephony.post('/voicemail-complete', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const url = new URL(c.req.url)
  const lang = url.searchParams.get('lang') || DEFAULT_LANGUAGE
  return telephonyResponse(adapter.handleVoicemailComplete(lang))
})

// --- Step 9: Call recording status callback (bridged call recording) ---
telephony.post('/call-recording', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { status: recordingStatus, recordingSid } = await adapter.parseRecordingWebhook(c.req.raw)
  const url = new URL(c.req.url)
  const parentCallSid = url.searchParams.get('parentCallSid') || ''
  const pubkey = url.searchParams.get('pubkey') || ''

  if (recordingStatus === 'completed' && parentCallSid) {
    // Get call info before ending (for audit)
    const activeRes = await dos.calls.fetch(new Request('http://do/calls/active'))
    const { calls: activeCalls } = await activeRes.json() as { calls: Array<{ id: string; callerLast4?: string; startedAt: string }> }
    const callRecord = activeCalls.find(call => call.id === parentCallSid)

    // Recording completed means the bridge ended — end the call in the DO
    // (safety net in case /call-status doesn't fire)
    const endRes = await dos.calls.fetch(new Request(`http://do/calls/${parentCallSid}/end`, { method: 'POST' }))
    console.log(`[call-recording] ended call ${parentCallSid}: ${endRes.status}`)

    if (pubkey) {
      await audit(dos.records, 'callEnded', pubkey, {
        callerLast4: callRecord?.callerLast4 || '',
      })
    }

    if (recordingSid) {
      c.executionCtx.waitUntil(
        maybeTranscribe(parentCallSid, recordingSid, pubkey, c.env, dos)
      )
    }
  }

  return telephonyResponse(adapter.emptyResponse())
})

// --- Step 10: Voicemail recording status callback ---
telephony.post('/voicemail-recording', async (c) => {
  const dos = getDOs(c.env)
  const adapter = (await getTelephony(c.env, dos))!
  const { status: recordingStatus } = await adapter.parseRecordingWebhook(c.req.raw)
  const url = new URL(c.req.url)
  const callSid = url.searchParams.get('callSid') || ''

  if (recordingStatus === 'completed') {
    await dos.calls.fetch(new Request(`http://do/calls/${callSid}/voicemail`, {
      method: 'POST',
    }))

    await audit(dos.records, 'voicemailReceived', 'system', { callSid }, c.req.raw)

    c.executionCtx.waitUntil(transcribeVoicemail(callSid, c.env, dos))
  }

  return telephonyResponse(adapter.emptyResponse())
})

export default telephony
