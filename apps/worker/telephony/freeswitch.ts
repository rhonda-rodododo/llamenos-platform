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
} from '@shared/languages'
import { IVR_PROMPTS, getPrompt, getVoicemailThanks } from '@shared/voice-prompts'

/**
 * FreeSwitchAdapter — generates mod_httapi XML responses for FreeSWITCH.
 *
 * FreeSWITCH's mod_httapi module POSTs channel variables to an HTTP endpoint
 * and expects XML documents back that control call flow. This adapter generates
 * those XML documents.
 *
 * Webhook parsing uses JSON from the sip-bridge sidecar (same protocol as
 * AsteriskAdapter). The bridge translates FreeSWITCH ESL events into
 * standardized JSON webhooks.
 */
export class FreeSwitchAdapter implements TelephonyAdapter {
  constructor(
    private phoneNumber: string,
    private bridgeCallbackUrl: string,
    private bridgeSecret: string,
    private callbackBaseUrl: string,
  ) {}

  // --- mod_httapi XML helpers ---

  private doc(work: string, params?: Record<string, string>): string {
    let paramsXml = ''
    if (params && Object.keys(params).length > 0) {
      const entries = Object.entries(params)
        .map(([k, v]) => `    <param name="${escapeXml(k)}" value="${escapeXml(v)}"/>`)
        .join('\n')
      paramsXml = `\n  <params>\n${entries}\n  </params>`
    }
    return `<document type="xml/freeswitch-httapi">${paramsXml}\n  <work>${work}\n  </work>\n</document>`
  }

  private speak(text: string, lang: string): string {
    return `\n    <speak voice="${getFliteVoice(lang)}">${escapeXml(text)}</speak>`
  }

  private play(url: string): string {
    return `\n    <playback file="${escapeXml(url)}"/>`
  }

  private speakOrPlay(promptKey: string, lang: string, audioUrls?: AudioUrlMap, text?: string): string {
    const audioUrl = audioUrls?.[`${promptKey}:${lang}`]
    if (audioUrl) return this.play(audioUrl)
    const content = text ?? getPrompt(promptKey, lang)
    return this.speak(content, lang)
  }

  private buildCallbackUrl(path: string, hubId?: string): string {
    const base = `${this.callbackBaseUrl}${path}`
    return hubId ? `${base}${base.includes('?') ? '&' : '?'}hub=${encodeURIComponent(hubId)}` : base
  }

  private xmlResponse(xml: string): TelephonyResponse {
    return {
      contentType: 'text/xml',
      body: xml,
    }
  }

  // --- IVR / Call flow ---

  async handleLanguageMenu(params: LanguageMenuParams): Promise<TelephonyResponse> {
    const { enabledLanguages, hubId } = params
    const activeLanguages = IVR_LANGUAGES.filter((code) => enabledLanguages.includes(code))

    if (activeLanguages.length <= 1) {
      const lang = activeLanguages[0] || DEFAULT_LANGUAGE
      const setVars = [
        `\n    <execute application="set" data="caller_lang=${escapeXml(lang)}"/>`,
        `\n    <execute application="set" data="call_phase=language_selected"/>`,
      ].join('')
      const callbackUrl = this.buildCallbackUrl('/api/telephony/incoming', hubId)
      const continueXml = `\n    <execute application="set" data="httapi_url=${escapeXml(callbackUrl)}"/>`
      return this.xmlResponse(
        this.doc(setVars + continueXml, {
          caller_lang: lang,
          call_phase: 'language_selected',
        }),
      )
    }

    let promptXml = ''
    for (const langCode of IVR_LANGUAGES) {
      if (!enabledLanguages.includes(langCode)) continue
      const prompt = IVR_PROMPTS[langCode]
      if (!prompt) continue
      promptXml += this.speak(prompt, langCode)
    }

    const callbackUrl = this.buildCallbackUrl('/api/telephony/language-selected', hubId)
    const bindXml = `\n    <bind strip="#">~\\d ${escapeXml(callbackUrl)}</bind>`
    const timeoutXml = '\n    <pause milliseconds="8000"/>'

    return this.xmlResponse(this.doc(promptXml + bindXml + timeoutXml))
  }

  async handleIncomingCall(params: IncomingCallParams): Promise<TelephonyResponse> {
    const { rateLimited, voiceCaptchaEnabled, callerLanguage: lang, callSid, audioUrls, hubId } = params

    if (rateLimited) {
      const speakXml = this.speakOrPlay('rateLimited', lang, audioUrls)
      const hangupXml = '\n    <hangup/>'
      return this.xmlResponse(this.doc(speakXml + hangupXml))
    }

    if (voiceCaptchaEnabled && params.captchaDigits) {
      const digits = params.captchaDigits
      const speakXml =
        this.speakOrPlay('captchaPrompt', lang, audioUrls) +
        this.speak(digits.split('').join(' '), lang)
      const callbackUrl = this.buildCallbackUrl('/api/telephony/captcha', hubId)
      const bindXml = `\n    <bind strip="#">~\\d{4} ${escapeXml(callbackUrl)}</bind>`
      const timeoutXml = '\n    <pause milliseconds="10000"/>'
      return this.xmlResponse(
        this.doc(speakXml + bindXml + timeoutXml, {
          call_phase: 'captcha',
        }),
      )
    }

    const speakXml = this.speakOrPlay('connecting', lang, audioUrls)
    const parkXml = `\n    <execute application="park"/>`
    return this.xmlResponse(
      this.doc(speakXml + parkXml, {
        call_phase: 'queue',
        queue_name: callSid,
      }),
    )
  }

  async handleCaptchaResponse(params: CaptchaResponseParams): Promise<TelephonyResponse> {
    const { digits, expectedDigits, callerLanguage: lang, callSid, hubId } = params

    if (digits === expectedDigits) {
      const speakXml = this.speak(getPrompt('captchaSuccess', lang), lang)
      const parkXml = `\n    <execute application="park"/>`
      return this.xmlResponse(
        this.doc(speakXml + parkXml, {
          call_phase: 'queue',
          queue_name: callSid,
        }),
      )
    }

    const failXml = this.speak(getPrompt('captchaFail', lang), lang)
    const hangupXml = '\n    <hangup/>'
    return this.xmlResponse(this.doc(failXml + hangupXml))
  }

  async handleCallAnswered(params: CallAnsweredParams): Promise<TelephonyResponse> {
    const { parentCallSid } = params
    const bridgeXml = `\n    <execute application="intercept" data="${escapeXml(parentCallSid)}"/>`
    return this.xmlResponse(this.doc(bridgeXml))
  }

  async handleVoicemail(params: VoicemailParams): Promise<TelephonyResponse> {
    const { callerLanguage: lang, audioUrls, maxRecordingSeconds, hubId } = params
    const maxSeconds = maxRecordingSeconds || 120
    const speakXml = this.speakOrPlay('voicemailPrompt', lang, audioUrls)
    const callbackUrl = this.buildCallbackUrl('/api/telephony/voicemail-recording', hubId)
    const recordXml = `\n    <record name="voicemail_${Date.now()}.wav" error-file="silence_stream://250" beep-file="tone_stream://%(250,0,800)" limit="${maxSeconds}" action="${escapeXml(callbackUrl)}"/>`
    return this.xmlResponse(this.doc(speakXml + recordXml))
  }

  async handleWaitMusic(
    lang: string,
    audioUrls?: AudioUrlMap,
    queueTime?: number,
    queueTimeout?: number,
  ): Promise<TelephonyResponse> {
    const timeout = queueTimeout || 90
    if (queueTime && queueTime >= timeout) {
      const leaveXml = `\n    <execute application="transfer" data="voicemail"/>`
      return this.xmlResponse(this.doc(leaveXml))
    }
    const musicXml = this.speakOrPlay('waitMessage', lang, audioUrls)
    return this.xmlResponse(this.doc(musicXml))
  }

  rejectCall(): TelephonyResponse {
    const hangupXml = '\n    <hangup cause="CALL_REJECTED"/>'
    return this.xmlResponse(this.doc(hangupXml))
  }

  handleVoicemailComplete(lang: string): TelephonyResponse {
    const speakXml = this.speak(getPrompt('captchaSuccess', lang), lang)
    const hangupXml = '\n    <hangup/>'
    return this.xmlResponse(this.doc(speakXml + hangupXml))
  }

  emptyResponse(): TelephonyResponse {
    return this.xmlResponse(this.doc(''))
  }

  // --- Call management (REST calls to bridge) ---

  async hangupCall(callSid: string): Promise<void> {
    await this.bridgeRequest('POST', '/commands/hangup', { channelId: callSid })
  }

  async ringVolunteers(params: RingVolunteersParams): Promise<string[]> {
    const { callSid, callerNumber, volunteers, callbackUrl, hubId } = params
    const result = await this.bridgeRequest('POST', '/commands/ring', {
      parentCallSid: callSid,
      callerNumber,
      volunteers: volunteers.map((v) => ({ callToken: v.callToken, phone: v.phone })),
      callbackUrl,
      hubId,
    })
    return (result as { callSids?: string[] })?.callSids ?? []
  }

  async cancelRinging(callSids: string[], exceptSid?: string): Promise<void> {
    await this.bridgeRequest('POST', '/commands/cancel-ringing', {
      callSids,
      exceptSid,
    })
  }

  async getCallRecording(callSid: string): Promise<ArrayBuffer | null> {
    try {
      const result = await this.bridgeRequest('GET', `/recordings/call/${callSid}`)
      if (result && typeof result === 'object' && 'audio' in result) {
        const base64 = (result as { audio: string }).audio
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
      }
      return null
    } catch {
      return null
    }
  }

  async getRecordingAudio(recordingSid: string): Promise<ArrayBuffer | null> {
    try {
      const result = await this.bridgeRequest('GET', `/recordings/${recordingSid}`)
      if (result && typeof result === 'object' && 'audio' in result) {
        const base64 = (result as { audio: string }).audio
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
      }
      return null
    } catch {
      return null
    }
  }

  // --- Webhook validation ---

  async validateWebhook(request: Request): Promise<boolean> {
    const signature = request.headers.get('X-Bridge-Signature')
    if (!signature) return false

    const body = await request.clone().text()
    const timestamp = request.headers.get('X-Bridge-Timestamp') || ''

    const tsSeconds = parseInt(timestamp, 10)
    if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
      return false
    }

    const payload = `${timestamp}.${body}`

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.bridgeSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const expectedSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    if (signature.length !== expectedSig.length) return false
    const encoder = new TextEncoder()
    const aBuf = encoder.encode(signature)
    const bBuf = encoder.encode(expectedSig)
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= aBuf[i] ^ bBuf[i]
    }
    return result === 0
  }

  // --- Webhook parsing (JSON payloads from bridge) ---

  async parseIncomingWebhook(request: Request): Promise<WebhookCallInfo> {
    const data = await request.json() as BridgeWebhookPayload
    return {
      callSid: data.channelId || data.callSid || '',
      callerNumber: data.callerNumber || data.from || '',
      calledNumber: data.calledNumber || data.to || undefined,
    }
  }

  async parseLanguageWebhook(request: Request): Promise<WebhookCallInfo & WebhookDigits> {
    const data = await request.json() as BridgeWebhookPayload
    return {
      callSid: data.channelId || data.callSid || '',
      callerNumber: data.callerNumber || data.from || '',
      digits: data.digits || '',
    }
  }

  async parseCaptchaWebhook(request: Request): Promise<WebhookDigits & { callerNumber: string }> {
    const data = await request.json() as BridgeWebhookPayload
    return {
      digits: data.digits || '',
      callerNumber: data.callerNumber || data.from || '',
    }
  }

  async parseCallStatusWebhook(request: Request): Promise<WebhookCallStatus> {
    const data = await request.json() as BridgeWebhookPayload
    return { status: mapBridgeStatus(data.state || data.status || '') }
  }

  async parseQueueWaitWebhook(request: Request): Promise<WebhookQueueWait> {
    const data = await request.json() as BridgeWebhookPayload
    return { queueTime: data.queueTime || 0 }
  }

  async parseQueueExitWebhook(request: Request): Promise<WebhookQueueResult> {
    const data = await request.json() as BridgeWebhookPayload
    return { result: mapQueueResult(data.result || data.reason || '') }
  }

  async parseRecordingWebhook(request: Request): Promise<WebhookRecordingStatus> {
    const data = await request.json() as BridgeWebhookPayload
    return {
      status: data.recordingStatus === 'done' ? 'completed' : 'failed',
      recordingSid: data.recordingName || data.recordingSid,
      callSid: data.channelId || data.callSid,
    }
  }

  // --- Internal helpers ---

  private async bridgeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.bridgeCallbackUrl}${path}`
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyStr = body ? JSON.stringify(body) : ''
    const payload = `${timestamp}.${bodyStr}`

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.bridgeSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const signature = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Signature': signature,
        'X-Bridge-Timestamp': timestamp,
      },
      body: bodyStr || undefined,
    })

    if (!response.ok) {
      throw new Error(`FreeSWITCH bridge request failed: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return response.json()
    }
    return null
  }
}

// --- Bridge webhook payload (same format as Asterisk bridge) ---

interface BridgeWebhookPayload {
  event?: string
  channelId?: string
  callSid?: string
  callerNumber?: string
  calledNumber?: string
  from?: string
  to?: string
  digits?: string
  state?: string
  status?: string
  queueTime?: number
  result?: string
  reason?: string
  recordingStatus?: string
  recordingName?: string
  recordingSid?: string
}

// --- Helpers ---

function getFliteVoice(_lang: string): string {
  return 'slt'
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function mapBridgeStatus(state: string): WebhookCallStatus['status'] {
  switch (state.toLowerCase()) {
    case 'ring':
    case 'ringing':
      return 'ringing'
    case 'up':
    case 'answered':
      return 'answered'
    case 'down':
    case 'hangup':
    case 'completed':
      return 'completed'
    case 'busy':
      return 'busy'
    case 'noanswer':
    case 'no-answer':
      return 'no-answer'
    case 'congestion':
    case 'failed':
      return 'failed'
    default:
      return 'initiated'
  }
}

function mapQueueResult(result: string): WebhookQueueResult['result'] {
  switch (result.toLowerCase()) {
    case 'bridged':
    case 'answered':
      return 'bridged'
    case 'leave':
    case 'timeout':
      return 'leave'
    case 'full':
    case 'queue-full':
      return 'queue-full'
    case 'hangup':
    case 'caller-hangup':
      return 'hangup'
    default:
      return 'error'
  }
}
