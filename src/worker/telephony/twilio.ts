import type {
  TelephonyAdapter,
  IncomingCallParams,
  CaptchaResponseParams,
  CallAnsweredParams,
  LanguageMenuParams,
  RingVolunteersParams,
  VoicemailParams,
  TelephonyResponse,
  AudioUrlMap,
  WebhookCallInfo,
  WebhookDigits,
  WebhookCallStatus,
  WebhookQueueResult,
  WebhookQueueWait,
  WebhookRecordingStatus,
} from './adapter'
import {
  DEFAULT_LANGUAGE,
  IVR_LANGUAGES,
} from '../../shared/languages'
import { IVR_PROMPTS, getPrompt, getVoicemailThanks } from '../../shared/voice-prompts'

/**
 * Twilio TwiML voice language codes, keyed by ISO 639-1 language code.
 * Provider-specific — lives here, not in shared config.
 */
const VOICE_CODES: Record<string, string> = {
  en: 'en-US',
  es: 'es-MX',
  zh: 'cmn-CN',
  tl: 'fil-PH',
  vi: 'vi-VN',
  ar: 'ar-XA',
  fr: 'fr-FR',
  ht: 'fr-FR', // Twilio doesn't support Haitian Creole; French is closest
  ko: 'ko-KR',
  ru: 'ru-RU',
  hi: 'hi-IN',
  pt: 'pt-BR',
  de: 'de-DE',
}

/**
 * Get Twilio voice language code for a language.
 * Falls back to en-US if the language isn't configured.
 */
function getTwilioVoice(lang: string): string {
  return VOICE_CODES[lang] ?? VOICE_CODES[DEFAULT_LANGUAGE]
}


/** Escape XML special characters for safe TwiML embedding */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Generate TwiML: <Play> if custom audio exists, <Say> fallback */
function sayOrPlay(promptKey: string, lang: string, audioUrls?: AudioUrlMap, text?: string): string {
  const audioUrl = audioUrls?.[`${promptKey}:${lang}`]
  if (audioUrl) {
    return `<Play>${escapeXml(audioUrl)}</Play>`
  }
  const voice = getTwilioVoice(lang)
  const content = text ?? getPrompt(promptKey, lang)
  return `<Say language="${voice}">${escapeXml(content)}</Say>`
}

/** Build XML-escaped hub query param suffix for TwiML callback URLs */
function hubXmlParam(hubId?: string): string {
  return hubId ? `&amp;hub=${escapeXml(encodeURIComponent(hubId))}` : ''
}

/** Build hub query param suffix for non-XML URLs */
function hubQueryParam(hubId?: string): string {
  return hubId ? `&hub=${encodeURIComponent(hubId)}` : ''
}

/**
 * TwilioAdapter — Twilio implementation of TelephonyAdapter.
 */
export class TwilioAdapter implements TelephonyAdapter {
  protected accountSid: string
  protected authToken: string
  protected phoneNumber: string

  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    this.accountSid = accountSid
    this.authToken = authToken
    this.phoneNumber = phoneNumber
  }

  async handleLanguageMenu(params: LanguageMenuParams): Promise<TelephonyResponse> {
    const enabled = params.enabledLanguages
    const hp = hubXmlParam(params.hubId)
    // Filter IVR languages to only those enabled by admin
    const activeLanguages = IVR_LANGUAGES.filter(code => enabled.includes(code))

    // If only 1 language enabled, skip the menu entirely
    if (activeLanguages.length <= 1) {
      const lang = activeLanguages[0] || DEFAULT_LANGUAGE
      return this.twiml(`
        <Response>
          <Redirect method="POST">/api/telephony/language-selected?auto=1&amp;forceLang=${lang}${hp}</Redirect>
        </Response>
      `)
    }

    // Build <Say> elements only for enabled languages, keeping fixed digit mapping
    const sayElements = IVR_LANGUAGES.map((langCode) => {
      if (!enabled.includes(langCode)) return ''
      const voice = getTwilioVoice(langCode)
      const prompt = IVR_PROMPTS[langCode]
      if (!prompt) return ''
      return `<Say language="${voice}">${prompt}</Say>`
    }).filter(Boolean).join('\n      ')

    return this.twiml(`
      <Response>
        <Gather numDigits="1" action="/api/telephony/language-selected${params.hubId ? `?hub=${escapeXml(encodeURIComponent(params.hubId))}` : ''}" method="POST" timeout="8">
          ${sayElements}
        </Gather>
        <Redirect method="POST">/api/telephony/language-selected?auto=1${hp}</Redirect>
      </Response>
    `)
  }

  async handleIncomingCall(params: IncomingCallParams): Promise<TelephonyResponse> {
    const lang = params.callerLanguage
    const tLang = getTwilioVoice(lang)
    const hp = hubXmlParam(params.hubId)
    const greetingText = getPrompt('greeting', lang).replace('{name}', params.hotlineName)
    const greetingTwiml = sayOrPlay('greeting', lang, params.audioUrls, greetingText)

    if (params.rateLimited) {
      const rateLimitTwiml = sayOrPlay('rateLimited', lang, params.audioUrls)
      return this.twiml(`
        <Response>
          ${greetingTwiml}
          ${rateLimitTwiml}
          <Hangup/>
        </Response>
      `)
    }

    if (params.voiceCaptchaEnabled && params.captchaDigits) {
      const digits = params.captchaDigits
      const captchaTwiml = sayOrPlay('captchaPrompt', lang, params.audioUrls)
      return this.twiml(`
        <Response>
          <Gather numDigits="4" action="/api/telephony/captcha?callSid=${params.callSid}&amp;lang=${lang}${hp}" method="POST" timeout="10">
            ${greetingTwiml}
            ${captchaTwiml}
            <Say language="${tLang}">${escapeXml(digits.split('').join(', '))}.</Say>
          </Gather>
          <Say language="${tLang}">${escapeXml(getPrompt('captchaTimeout', lang))}</Say>
          <Hangup/>
        </Response>
      `)
    }

    const holdTwiml = sayOrPlay('pleaseHold', lang, params.audioUrls)
    return this.twiml(`
      <Response>
        ${greetingTwiml}
        ${holdTwiml}
        <Enqueue waitUrl="/api/telephony/wait-music?lang=${lang}${hp}" action="/api/telephony/queue-exit?callSid=${params.callSid}&amp;lang=${lang}${hp}" method="POST">${params.callSid}</Enqueue>
      </Response>
    `)
  }

  async handleCaptchaResponse(params: CaptchaResponseParams): Promise<TelephonyResponse> {
    const lang = params.callerLanguage
    const tLang = getTwilioVoice(lang)
    const hp = hubXmlParam(params.hubId)

    if (params.digits === params.expectedDigits) {
      return this.twiml(`
        <Response>
          <Say language="${tLang}">${getPrompt('captchaSuccess', lang)}</Say>
          <Enqueue waitUrl="/api/telephony/wait-music?lang=${lang}${hp}" action="/api/telephony/queue-exit?callSid=${params.callSid}&amp;lang=${lang}${hp}" method="POST">${params.callSid}</Enqueue>
        </Response>
      `)
    }
    return this.twiml(`
      <Response>
        <Say language="${tLang}">${getPrompt('captchaFail', lang)}</Say>
        <Hangup/>
      </Response>
    `)
  }

  async handleCallAnswered(params: CallAnsweredParams): Promise<TelephonyResponse> {
    const hp = hubXmlParam(params.hubId)
    return this.twiml(`
      <Response>
        <Dial record="record-from-answer" recordingStatusCallback="${params.callbackUrl}/api/telephony/call-recording?parentCallSid=${params.parentCallSid}&amp;pubkey=${params.volunteerPubkey}${hp}" recordingStatusCallbackEvent="completed">
          <Queue>${params.parentCallSid}</Queue>
        </Dial>
      </Response>
    `)
  }

  async handleWaitMusic(lang: string, audioUrls?: AudioUrlMap, queueTime?: number, queueTimeout?: number): Promise<TelephonyResponse> {
    // After timeout in queue with no answer, leave queue → triggers voicemail
    if (queueTime !== undefined && queueTime >= (queueTimeout ?? 90)) {
      return this.twiml(`<Response><Leave/></Response>`)
    }

    const waitTwiml = sayOrPlay('waitMessage', lang, audioUrls)
    return this.twiml(`
      <Response>
        ${waitTwiml}
        <Play>https://com.twilio.music.soft-rock.s3.amazonaws.com/_ghost_-_promo_2_sample_pack.mp3</Play>
      </Response>
    `)
  }

  async handleVoicemail(params: VoicemailParams): Promise<TelephonyResponse> {
    const lang = params.callerLanguage
    const hp = hubXmlParam(params.hubId)
    const voicemailTwiml = sayOrPlay('voicemailPrompt', lang, params.audioUrls)
    return this.twiml(`
      <Response>
        ${voicemailTwiml}
        <Record maxLength="${params.maxRecordingSeconds ?? 120}" action="/api/telephony/voicemail-complete?callSid=${params.callSid}&amp;lang=${lang}${hp}" recordingStatusCallback="${params.callbackUrl}/api/telephony/voicemail-recording?callSid=${params.callSid}${hp}" recordingStatusCallbackEvent="completed" />
        <Hangup/>
      </Response>
    `)
  }

  rejectCall(): TelephonyResponse {
    return this.twiml('<Response><Reject reason="rejected"/></Response>')
  }

  async hangupCall(callSid: string): Promise<void> {
    await this.twilioApi(`/Calls/${callSid}.json`, {
      method: 'POST',
      body: new URLSearchParams({ Status: 'completed' }),
    })
  }

  async ringVolunteers(params: RingVolunteersParams): Promise<string[]> {
    const callSids: string[] = []
    const hubParam = params.hubId ? `&hub=${encodeURIComponent(params.hubId)}` : ''

    const calls = await Promise.allSettled(
      params.volunteers.map(async (vol) => {
        const body = new URLSearchParams({
          To: vol.phone,
          From: this.phoneNumber,
          Url: `${params.callbackUrl}/api/telephony/volunteer-answer?parentCallSid=${params.callSid}&pubkey=${vol.pubkey}${hubParam}`,
          StatusCallback: `${params.callbackUrl}/api/telephony/call-status?parentCallSid=${params.callSid}&pubkey=${vol.pubkey}${hubParam}`,
          Timeout: '30',
          MachineDetection: 'Enable',
        })
        // Twilio REST API requires separate params per event (not space-separated)
        body.append('StatusCallbackEvent', 'initiated')
        body.append('StatusCallbackEvent', 'ringing')
        body.append('StatusCallbackEvent', 'answered')
        body.append('StatusCallbackEvent', 'completed')

        const res = await this.twilioApi('/Calls.json', {
          method: 'POST',
          body,
        })

        if (res.ok) {
          const data = await res.json() as { sid: string }
          return data.sid
        }
        throw new Error(`Failed to call ${vol.pubkey}`)
      })
    )

    for (const result of calls) {
      if (result.status === 'fulfilled') {
        callSids.push(result.value)
      }
    }

    return callSids
  }

  async cancelRinging(callSids: string[], exceptSid?: string): Promise<void> {
    await Promise.allSettled(
      callSids
        .filter(sid => sid !== exceptSid)
        .map(sid =>
          this.twilioApi(`/Calls/${sid}.json`, {
            method: 'POST',
            body: new URLSearchParams({ Status: 'completed' }),
          })
        )
    )
  }

  async validateWebhook(request: Request): Promise<boolean> {
    const signature = request.headers.get('X-Twilio-Signature')
    if (!signature) return false

    const url = new URL(request.url)
    const body = await request.clone().text()
    const params = new URLSearchParams(body)

    let dataString = url.toString()
    const sortedKeys = Array.from(params.keys()).sort()
    for (const key of sortedKeys) {
      dataString += key + params.get(key)
    }

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.authToken),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataString))
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expected.length) return false
    const aBuf = encoder.encode(signature)
    const bBuf = encoder.encode(expected)
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= aBuf[i] ^ bBuf[i]
    }
    return result === 0
  }

  async getCallRecording(callSid: string): Promise<ArrayBuffer | null> {
    const res = await this.twilioApi(`/Calls/${callSid}/Recordings.json`, {
      method: 'GET',
    })
    if (!res.ok) return null

    const data = await res.json() as { recordings?: Array<{ sid: string }> }
    if (!data.recordings?.length) return null

    const recordingSid = data.recordings[0].sid
    const audioRes = await fetch(
      `${this.getRecordingBaseUrl()}/Recordings/${recordingSid}.wav`,
      {
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
        },
      }
    )

    if (!audioRes.ok) return null
    return audioRes.arrayBuffer()
  }

  async getRecordingAudio(recordingSid: string): Promise<ArrayBuffer | null> {
    const audioRes = await fetch(
      `${this.getRecordingBaseUrl()}/Recordings/${recordingSid}.wav`,
      {
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
        },
      }
    )
    if (!audioRes.ok) return null
    return audioRes.arrayBuffer()
  }

  // --- Webhook parsing ---

  async parseIncomingWebhook(request: Request): Promise<WebhookCallInfo> {
    const form = await request.clone().formData()
    return {
      callSid: form.get('CallSid') as string,
      callerNumber: form.get('From') as string,
      calledNumber: (form.get('To') as string) || undefined,
    }
  }

  async parseLanguageWebhook(request: Request): Promise<WebhookCallInfo & WebhookDigits> {
    const form = await request.clone().formData()
    return {
      callSid: form.get('CallSid') as string,
      callerNumber: form.get('From') as string,
      digits: (form.get('Digits') as string) || '',
    }
  }

  async parseCaptchaWebhook(request: Request): Promise<WebhookDigits & { callerNumber: string }> {
    const form = await request.clone().formData()
    return {
      digits: (form.get('Digits') as string) || '',
      callerNumber: (form.get('From') as string) || '',
    }
  }

  async parseCallStatusWebhook(request: Request): Promise<WebhookCallStatus> {
    const form = await request.clone().formData()
    const raw = form.get('CallStatus') as string
    const STATUS_MAP: Record<string, WebhookCallStatus['status']> = {
      initiated: 'initiated',
      ringing: 'ringing',
      'in-progress': 'answered',
      completed: 'completed',
      busy: 'busy',
      'no-answer': 'no-answer',
      failed: 'failed',
      canceled: 'failed',
    }
    return { status: STATUS_MAP[raw] ?? 'failed' }
  }

  async parseQueueWaitWebhook(request: Request): Promise<WebhookQueueWait> {
    const form = await request.clone().formData()
    return {
      queueTime: parseInt((form.get('QueueTime') as string) || '0', 10),
    }
  }

  async parseQueueExitWebhook(request: Request): Promise<WebhookQueueResult> {
    const form = await request.clone().formData()
    const raw = form.get('QueueResult') as string
    const RESULT_MAP: Record<string, WebhookQueueResult['result']> = {
      'leave': 'leave',
      'queue-full': 'queue-full',
      'error': 'error',
      'bridged': 'bridged',
      'hangup': 'hangup',
    }
    return { result: RESULT_MAP[raw] ?? 'error' }
  }

  async parseRecordingWebhook(request: Request): Promise<WebhookRecordingStatus> {
    const form = await request.clone().formData()
    const raw = form.get('RecordingStatus') as string
    return {
      status: raw === 'completed' ? 'completed' : 'failed',
      recordingSid: (form.get('RecordingSid') as string) || undefined,
      callSid: (form.get('CallSid') as string) || undefined,
    }
  }

  // --- Additional response methods ---

  handleVoicemailComplete(lang: string): TelephonyResponse {
    const voice = getTwilioVoice(lang)
    return this.twiml(`
      <Response>
        <Say language="${voice}">${getVoicemailThanks(lang)}</Say>
        <Hangup/>
      </Response>
    `)
  }

  emptyResponse(): TelephonyResponse {
    return this.twiml('<Response/>')
  }

  // --- Helpers ---

  protected twiml(xml: string): TelephonyResponse {
    return {
      contentType: 'text/xml',
      body: xml.trim(),
    }
  }

  protected getApiBaseUrl(): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`
  }

  protected getRecordingBaseUrl(): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`
  }

  protected async twilioApi(path: string, init: RequestInit): Promise<Response> {
    return fetch(
      `${this.getApiBaseUrl()}${path}`,
      {
        ...init,
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
          ...(init.body instanceof URLSearchParams
            ? { 'Content-Type': 'application/x-www-form-urlencoded' }
            : {}),
          ...init.headers,
        },
      }
    )
  }
}
