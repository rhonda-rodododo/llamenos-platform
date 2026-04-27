import type {
  IncomingCallParams,
  CaptchaResponseParams,
  CallAnsweredParams,
  LanguageMenuParams,
  VoicemailParams,
  TelephonyResponse,
  AudioUrlMap,
} from './adapter'
import { SipBridgeAdapter } from './sip-bridge-adapter'
import {
  DEFAULT_LANGUAGE,
  IVR_LANGUAGES,
} from '@shared/languages'
import { IVR_PROMPTS, getPrompt } from '@shared/voice-prompts'

/**
 * ARI command types — JSON commands sent to the sip-bridge sidecar.
 */
interface AriCommandBase {
  action: string
}

interface AriSpeakCommand extends AriCommandBase {
  action: 'speak'
  text: string
  language: string
}

interface AriPlayCommand extends AriCommandBase {
  action: 'play'
  url: string
}

interface AriGatherCommand extends AriCommandBase {
  action: 'gather'
  numDigits: number
  timeout: number
  callbackEvent: string
  metadata?: Record<string, string>
}

interface AriQueueCommand extends AriCommandBase {
  action: 'queue'
  queueName: string
  waitMusicEvent: string
  exitEvent: string
}

interface AriBridgeCommand extends AriCommandBase {
  action: 'bridge'
  queueName: string
  record: boolean
}

interface AriRecordCommand extends AriCommandBase {
  action: 'record'
  maxDuration: number
  finishOnKey: string
  callbackEvent: string
}

interface AriHangupCommand extends AriCommandBase {
  action: 'hangup'
  reason?: string
}

interface AriLeaveQueueCommand extends AriCommandBase {
  action: 'leave_queue'
}

type AriCommand =
  | AriSpeakCommand
  | AriPlayCommand
  | AriGatherCommand
  | AriQueueCommand
  | AriBridgeCommand
  | AriRecordCommand
  | AriHangupCommand
  | AriLeaveQueueCommand

/**
 * AsteriskAdapter — communicates with the sip-bridge sidecar running
 * alongside Asterisk. Sends JSON commands; receives JSON webhooks.
 *
 * Extends SipBridgeAdapter which provides shared bridge communication,
 * webhook validation/parsing, and recording retrieval.
 */
export class AsteriskAdapter extends SipBridgeAdapter {
  constructor(
    private ariUrl: string,
    private ariUsername: string,
    private ariPassword: string,
    phoneNumber: string,
    bridgeCallbackUrl: string,
    bridgeSecret: string,
  ) {
    super(phoneNumber, bridgeCallbackUrl, bridgeSecret)
  }

  getEndpointFormat(phone: string): string {
    return `PJSIP/${phone}@trunk`
  }

  getPbxType(): string {
    return 'asterisk'
  }

  protected override mapLanguage(lang: string): string {
    return getAsteriskLang(lang)
  }

  // --- JSON command helpers ---

  private ariJson(commands: AriCommand[]): TelephonyResponse {
    return this.json(commands)
  }

  private ariSpeak(text: string, lang: string): AriCommand {
    return { action: 'speak', text, language: getAsteriskLang(lang) }
  }

  private ariPlay(url: string): AriCommand {
    return { action: 'play', url }
  }

  private ariSpeakOrPlay(promptKey: string, lang: string, audioUrls?: AudioUrlMap, text?: string): AriCommand {
    const audioUrl = audioUrls?.[`${promptKey}:${lang}`]
    if (audioUrl) return this.ariPlay(audioUrl)
    const content = text ?? getPrompt(promptKey, lang)
    return this.ariSpeak(content, lang)
  }

  // --- IVR / Call flow ---

  async handleLanguageMenu(params: LanguageMenuParams): Promise<TelephonyResponse> {
    const { enabledLanguages } = params
    const activeLanguages = IVR_LANGUAGES.filter((code) => enabledLanguages.includes(code))

    if (activeLanguages.length <= 1) {
      const lang = activeLanguages[0] || DEFAULT_LANGUAGE
      return this.ariJson([
        this.ariSpeak(' ', lang),
        {
          action: 'gather',
          numDigits: 0,
          timeout: 0,
          callbackEvent: 'language_selected',
          metadata: { auto: '1', forceLang: lang },
        },
      ])
    }

    const commands: AriCommand[] = []
    for (const langCode of IVR_LANGUAGES) {
      if (!enabledLanguages.includes(langCode)) continue
      const prompt = IVR_PROMPTS[langCode]
      if (!prompt) continue
      commands.push(this.ariSpeak(prompt, langCode))
    }

    commands.push({
      action: 'gather',
      numDigits: 1,
      timeout: 8,
      callbackEvent: 'language_selected',
    })

    return this.ariJson(commands)
  }

  async handleIncomingCall(params: IncomingCallParams): Promise<TelephonyResponse> {
    const { rateLimited, voiceCaptchaEnabled, callerLanguage: lang, callSid, audioUrls } = params

    if (rateLimited) {
      return this.ariJson([
        this.ariSpeakOrPlay('rateLimited', lang, audioUrls),
        { action: 'hangup' },
      ])
    }

    if (voiceCaptchaEnabled && params.captchaDigits) {
      const digits = params.captchaDigits
      return this.ariJson([
        this.ariSpeakOrPlay(
          'captcha',
          lang,
          audioUrls,
          getPrompt('captcha', lang).replace('{digits}', digits.split('').join(' '))
        ),
        {
          action: 'gather',
          numDigits: 4,
          timeout: 10,
          callbackEvent: 'captcha_response',
          metadata: { callSid },
        },
      ])
    }

    return this.ariJson([
      this.ariSpeakOrPlay('connecting', lang, audioUrls),
      {
        action: 'queue',
        queueName: callSid,
        waitMusicEvent: 'wait_music',
        exitEvent: 'queue_exit',
      },
    ])
  }

  async handleCaptchaResponse(params: CaptchaResponseParams): Promise<TelephonyResponse> {
    const { digits, expectedDigits, callerLanguage: lang, callSid } = params

    if (digits === expectedDigits) {
      return this.ariJson([
        this.ariSpeak(getPrompt('captchaSuccess', lang), lang),
        {
          action: 'queue',
          queueName: callSid,
          waitMusicEvent: 'wait_music',
          exitEvent: 'queue_exit',
        },
      ])
    }

    return this.ariJson([
      this.ariSpeak(getPrompt('captchaFailed', lang), lang),
      { action: 'hangup' },
    ])
  }

  async handleCallAnswered(params: CallAnsweredParams): Promise<TelephonyResponse> {
    const { parentCallSid } = params
    return this.ariJson([
      {
        action: 'bridge',
        queueName: parentCallSid,
        record: true,
      },
    ])
  }

  async handleVoicemail(params: VoicemailParams): Promise<TelephonyResponse> {
    const { callerLanguage: lang, audioUrls, maxRecordingSeconds } = params
    return this.ariJson([
      this.ariSpeakOrPlay('voicemailPrompt', lang, audioUrls),
      {
        action: 'record',
        maxDuration: maxRecordingSeconds || 120,
        finishOnKey: '#',
        callbackEvent: 'recording_complete',
      },
    ])
  }

  async handleWaitMusic(
    lang: string,
    audioUrls?: AudioUrlMap,
    queueTime?: number,
    queueTimeout?: number,
  ): Promise<TelephonyResponse> {
    const timeout = queueTimeout || 90
    if (queueTime && queueTime >= timeout) {
      return this.ariJson([{ action: 'leave_queue' }])
    }
    return this.ariJson([this.ariSpeakOrPlay('holdMusic', lang, audioUrls)])
  }

  rejectCall(): TelephonyResponse {
    return this.ariJson([{ action: 'hangup', reason: 'rejected' }])
  }

  handleVoicemailComplete(lang: string): TelephonyResponse {
    return this.ariJson([
      this.ariSpeak(getPrompt('voicemailThankYou', lang), lang),
      { action: 'hangup' },
    ])
  }

  emptyResponse(): TelephonyResponse {
    return { contentType: 'application/json', body: JSON.stringify({ commands: [] }) }
  }
}

// --- Helpers ---

function getAsteriskLang(lang: string): string {
  const map: Record<string, string> = {
    en: 'en-US',
    es: 'es',
    zh: 'zh',
    tl: 'en-US', // Tagalog — fallback to English TTS
    vi: 'vi',
    ar: 'ar',
    fr: 'fr',
    ht: 'fr', // Haitian Creole — fallback to French
    ko: 'ko',
    ru: 'ru',
    hi: 'hi',
    pt: 'pt-BR',
  }
  return map[lang] || 'en-US'
}
