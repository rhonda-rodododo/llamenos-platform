import { DurableObject } from 'cloudflare:workers'
import type { Env, SpamSettings, CallSettings } from '../types'
import type { CustomFieldDefinition, TelephonyProviderConfig, MessagingConfig, SetupState, EnabledChannels } from '../../shared/types'
import { MAX_CUSTOM_FIELDS, MAX_SELECT_OPTIONS, MAX_FIELD_NAME_LENGTH, MAX_FIELD_LABEL_LENGTH, MAX_OPTION_LENGTH, FIELD_NAME_REGEX, PROVIDER_REQUIRED_FIELDS, DEFAULT_MESSAGING_CONFIG, DEFAULT_SETUP_STATE } from '../../shared/types'
import { IVR_LANGUAGES } from '../../shared/languages'
import { DORouter } from '../lib/do-router'

/**
 * SettingsDO — manages system configuration:
 * - Spam settings
 * - Transcription settings
 * - Call settings
 * - IVR languages
 * - Custom fields
 * - Telephony provider
 * - IVR audio
 * - Fallback group
 * - Rate limiting
 */
export class SettingsDO extends DurableObject<Env> {
  private initialized = false
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // --- Settings ---
    this.router.get('/settings/spam', () => this.getSpamSettings())
    this.router.patch('/settings/spam', async (req) => this.updateSpamSettings(await req.json()))
    this.router.get('/settings/transcription', () => this.getTranscriptionSettings())
    this.router.patch('/settings/transcription', async (req) => this.updateTranscriptionSettings(await req.json()))
    this.router.get('/settings/call', () => this.getCallSettings())
    this.router.patch('/settings/call', async (req) => this.updateCallSettings(await req.json()))
    this.router.get('/settings/ivr-languages', () => this.getIvrLanguages())
    this.router.patch('/settings/ivr-languages', async (req) => this.updateIvrLanguages(await req.json()))

    // --- Custom Fields ---
    this.router.get('/settings/custom-fields', (req) => {
      const role = new URL(req.url).searchParams.get('role') || 'admin'
      return this.getCustomFields(role)
    })
    this.router.put('/settings/custom-fields', async (req) => this.updateCustomFields(await req.json()))

    // --- Telephony Provider ---
    this.router.get('/settings/telephony-provider', () => this.getTelephonyProvider())
    this.router.patch('/settings/telephony-provider', async (req) => this.updateTelephonyProvider(await req.json()))

    // --- IVR Audio ---
    this.router.get('/settings/ivr-audio', () => this.getIvrAudioList())
    this.router.put('/settings/ivr-audio/:promptType/:language', async (req, { promptType, language }) =>
      this.uploadIvrAudio(promptType, language, await req.arrayBuffer()))
    this.router.get('/settings/ivr-audio/:promptType/:language', (_req, { promptType, language }) =>
      this.getIvrAudio(promptType, language))
    this.router.delete('/settings/ivr-audio/:promptType/:language', (_req, { promptType, language }) =>
      this.deleteIvrAudio(promptType, language))

    // --- Messaging Config ---
    this.router.get('/settings/messaging', () => this.getMessagingConfig())
    this.router.patch('/settings/messaging', async (req) => this.updateMessagingConfig(await req.json()))

    // --- Setup State ---
    this.router.get('/settings/setup', () => this.getSetupState())
    this.router.patch('/settings/setup', async (req) => this.updateSetupState(await req.json()))

    // --- Enabled Channels (computed) ---
    this.router.get('/settings/enabled-channels', () => this.getEnabledChannels())

    // --- Fallback Group ---
    this.router.get('/fallback', () => this.getFallbackGroup())
    this.router.put('/fallback', async (req) => this.setFallbackGroup(await req.json()))

    // --- Rate Limiting ---
    this.router.post('/rate-limit/check', async (req) => this.checkRateLimit(await req.json()))

    // --- Test Reset ---
    this.router.post('/reset', async () => {
      await this.ctx.storage.deleteAll()
      this.initialized = false
      await this.ensureInit()
      return Response.json({ ok: true })
    })
  }

  private async ensureInit() {
    if (this.initialized) return
    this.initialized = true

    if (!(await this.ctx.storage.get('spamSettings'))) {
      await this.ctx.storage.put<SpamSettings>('spamSettings', {
        voiceCaptchaEnabled: false,
        rateLimitEnabled: true,
        maxCallsPerMinute: 3,
        blockDurationMinutes: 30,
      })
    }
    if (await this.ctx.storage.get('transcriptionEnabled') === undefined) {
      await this.ctx.storage.put('transcriptionEnabled', true)
    }
    if (!(await this.ctx.storage.get('fallbackGroup'))) {
      await this.ctx.storage.put('fallbackGroup', [] as string[])
    }
    if (!(await this.ctx.storage.get('ivrLanguages'))) {
      await this.ctx.storage.put('ivrLanguages', [...IVR_LANGUAGES])
    }
    if (!(await this.ctx.storage.get('callSettings'))) {
      await this.ctx.storage.put<CallSettings>('callSettings', {
        queueTimeoutSeconds: 90,
        voicemailMaxSeconds: 120,
      })
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInit()
    return this.router.handle(request)
  }

  override async alarm() {
    const now = Date.now()

    // Clean up expired rate limit entries
    const rlKeys = await this.ctx.storage.list({ prefix: 'ratelimit:' })
    for (const [key, value] of rlKeys) {
      const timestamps = value as number[]
      const recent = timestamps.filter(t => now - t < 60_000)
      if (recent.length === 0) {
        await this.ctx.storage.delete(key)
      } else {
        await this.ctx.storage.put(key, recent)
      }
    }
  }

  // --- Spam Settings ---

  private async getSpamSettings(): Promise<Response> {
    const settings = await this.ctx.storage.get<SpamSettings>('spamSettings')
    return Response.json(settings)
  }

  private async updateSpamSettings(data: Partial<SpamSettings>): Promise<Response> {
    const settings = await this.ctx.storage.get<SpamSettings>('spamSettings')!
    const updated = { ...settings, ...data }
    await this.ctx.storage.put('spamSettings', updated)
    return Response.json(updated)
  }

  // --- IVR Languages ---

  private async getIvrLanguages(): Promise<Response> {
    const languages = await this.ctx.storage.get<string[]>('ivrLanguages') || [...IVR_LANGUAGES]
    return Response.json({ enabledLanguages: languages })
  }

  private async updateIvrLanguages(data: { enabledLanguages: string[] }): Promise<Response> {
    if (!Array.isArray(data.enabledLanguages) || data.enabledLanguages.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one language must be enabled' }), { status: 400 })
    }
    const valid = data.enabledLanguages.filter(code => IVR_LANGUAGES.includes(code))
    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid IVR language codes provided' }), { status: 400 })
    }
    await this.ctx.storage.put('ivrLanguages', valid)
    return Response.json({ enabledLanguages: valid })
  }

  // --- Transcription Settings ---

  private async getTranscriptionSettings(): Promise<Response> {
    const enabled = await this.ctx.storage.get<boolean>('transcriptionEnabled')
    const allowVolunteerOptOut = await this.ctx.storage.get<boolean>('allowVolunteerTranscriptionOptOut')
    return Response.json({ globalEnabled: enabled ?? true, allowVolunteerOptOut: allowVolunteerOptOut ?? false })
  }

  private async updateTranscriptionSettings(data: { globalEnabled?: boolean; allowVolunteerOptOut?: boolean }): Promise<Response> {
    if (data.globalEnabled !== undefined) {
      await this.ctx.storage.put('transcriptionEnabled', data.globalEnabled)
    }
    if (data.allowVolunteerOptOut !== undefined) {
      await this.ctx.storage.put('allowVolunteerTranscriptionOptOut', data.allowVolunteerOptOut)
    }
    const enabled = await this.ctx.storage.get<boolean>('transcriptionEnabled')
    const allowVolunteerOptOut = await this.ctx.storage.get<boolean>('allowVolunteerTranscriptionOptOut')
    return Response.json({ globalEnabled: enabled ?? true, allowVolunteerOptOut: allowVolunteerOptOut ?? false })
  }

  // --- Call Settings ---

  private async getCallSettings(): Promise<Response> {
    const settings = await this.ctx.storage.get<CallSettings>('callSettings') || {
      queueTimeoutSeconds: 90,
      voicemailMaxSeconds: 120,
    }
    return Response.json(settings)
  }

  private async updateCallSettings(data: Partial<CallSettings>): Promise<Response> {
    const current = await this.ctx.storage.get<CallSettings>('callSettings') || {
      queueTimeoutSeconds: 90,
      voicemailMaxSeconds: 120,
    }
    const clamp = (v: number) => Math.max(30, Math.min(300, v))
    const updated: CallSettings = {
      queueTimeoutSeconds: data.queueTimeoutSeconds !== undefined ? clamp(data.queueTimeoutSeconds) : current.queueTimeoutSeconds,
      voicemailMaxSeconds: data.voicemailMaxSeconds !== undefined ? clamp(data.voicemailMaxSeconds) : current.voicemailMaxSeconds,
    }
    await this.ctx.storage.put('callSettings', updated)
    return Response.json(updated)
  }

  // --- Fallback Group ---

  private async getFallbackGroup(): Promise<Response> {
    const group = await this.ctx.storage.get<string[]>('fallbackGroup') || []
    return Response.json({ volunteers: group })
  }

  private async setFallbackGroup(data: { volunteers: string[] }): Promise<Response> {
    await this.ctx.storage.put('fallbackGroup', data.volunteers)
    return Response.json({ ok: true })
  }

  // --- Rate Limit ---

  private async checkRateLimit(data: { key: string; maxPerMinute: number }): Promise<Response> {
    const storageKey = `ratelimit:${data.key}`
    const now = Date.now()
    const windowMs = 60_000
    const timestamps = await this.ctx.storage.get<number[]>(storageKey) || []
    const recent = timestamps.filter(t => now - t < windowMs)
    recent.push(now)
    await this.ctx.storage.put(storageKey, recent)
    try { await this.ctx.storage.setAlarm(now + windowMs + 1000) } catch { /* alarm already set */ }
    const limited = recent.length > data.maxPerMinute
    return Response.json({ limited })
  }

  // --- Custom Fields ---

  private async getCustomFields(role: string): Promise<Response> {
    const fields = await this.ctx.storage.get<CustomFieldDefinition[]>('customFields') || []
    if (role !== 'admin') {
      return Response.json({ fields: fields.filter(f => f.visibleToVolunteers) })
    }
    return Response.json({ fields })
  }

  private async updateCustomFields(data: unknown): Promise<Response> {
    if (!data || !Array.isArray((data as { fields?: unknown }).fields)) {
      return new Response(JSON.stringify({ error: 'Invalid request: fields array required' }), { status: 400 })
    }
    const fields = (data as { fields: CustomFieldDefinition[] }).fields

    if (fields.length > MAX_CUSTOM_FIELDS) {
      return new Response(JSON.stringify({ error: `Maximum ${MAX_CUSTOM_FIELDS} custom fields` }), { status: 400 })
    }

    const names = new Set<string>()
    for (const field of fields) {
      if (!field.name || !field.label || !field.type) {
        return new Response(JSON.stringify({ error: 'Each field must have name, label, and type' }), { status: 400 })
      }
      if (!FIELD_NAME_REGEX.test(field.name)) {
        return new Response(JSON.stringify({ error: `Invalid field name: ${field.name}. Use alphanumeric and underscores only.` }), { status: 400 })
      }
      if (field.name.length > MAX_FIELD_NAME_LENGTH) {
        return new Response(JSON.stringify({ error: `Field name too long: ${field.name}` }), { status: 400 })
      }
      if (field.label.length > MAX_FIELD_LABEL_LENGTH) {
        return new Response(JSON.stringify({ error: `Field label too long (max ${MAX_FIELD_LABEL_LENGTH} chars)` }), { status: 400 })
      }
      if (names.has(field.name)) {
        return new Response(JSON.stringify({ error: `Duplicate field name: ${field.name}` }), { status: 400 })
      }
      names.add(field.name)
      if (!['text', 'number', 'select', 'checkbox', 'textarea'].includes(field.type)) {
        return new Response(JSON.stringify({ error: `Invalid field type: ${field.type}` }), { status: 400 })
      }
      if (field.type === 'select') {
        if (!field.options || field.options.length === 0) {
          return new Response(JSON.stringify({ error: `Select field "${field.name}" must have options` }), { status: 400 })
        }
        if (field.options.length > MAX_SELECT_OPTIONS) {
          return new Response(JSON.stringify({ error: `Too many options for "${field.name}" (max ${MAX_SELECT_OPTIONS})` }), { status: 400 })
        }
        for (const opt of field.options) {
          if (typeof opt !== 'string' || opt.length > MAX_OPTION_LENGTH) {
            return new Response(JSON.stringify({ error: `Option too long in "${field.name}" (max ${MAX_OPTION_LENGTH} chars)` }), { status: 400 })
          }
        }
      }
    }

    const normalized = fields.map((f, i) => ({ ...f, order: i }))
    await this.ctx.storage.put('customFields', normalized)
    return Response.json({ fields: normalized })
  }

  // --- Messaging Config ---

  private async getMessagingConfig(): Promise<Response> {
    const config = await this.ctx.storage.get<MessagingConfig>('messagingConfig')
    return Response.json(config || DEFAULT_MESSAGING_CONFIG)
  }

  private async updateMessagingConfig(data: Partial<MessagingConfig>): Promise<Response> {
    const current = await this.ctx.storage.get<MessagingConfig>('messagingConfig') || { ...DEFAULT_MESSAGING_CONFIG }
    const updated = { ...current, ...data }

    // Validate
    if (updated.inactivityTimeout < 5 || updated.inactivityTimeout > 1440) {
      return new Response(JSON.stringify({ error: 'Inactivity timeout must be between 5 and 1440 minutes' }), { status: 400 })
    }
    if (updated.maxConcurrentPerVolunteer < 1 || updated.maxConcurrentPerVolunteer > 20) {
      return new Response(JSON.stringify({ error: 'Max concurrent must be between 1 and 20' }), { status: 400 })
    }

    await this.ctx.storage.put('messagingConfig', updated)
    return Response.json(updated)
  }

  // --- Setup State ---

  private async getSetupState(): Promise<Response> {
    const state = await this.ctx.storage.get<SetupState>('setupState')
    return Response.json(state || DEFAULT_SETUP_STATE)
  }

  private async updateSetupState(data: Partial<SetupState>): Promise<Response> {
    const current = await this.ctx.storage.get<SetupState>('setupState') || { ...DEFAULT_SETUP_STATE }
    const updated = { ...current, ...data }
    await this.ctx.storage.put('setupState', updated)
    return Response.json(updated)
  }

  // --- Enabled Channels ---

  private async getEnabledChannels(): Promise<Response> {
    const telephonyConfig = await this.ctx.storage.get<TelephonyProviderConfig>('telephonyProvider')
    const messagingConfig = await this.ctx.storage.get<MessagingConfig>('messagingConfig')
    const setupState = await this.ctx.storage.get<SetupState>('setupState')

    // Voice is enabled if a telephony provider is configured OR env vars are set
    const voiceEnabled = !!telephonyConfig || (
      !!(this.env.TWILIO_ACCOUNT_SID && this.env.TWILIO_AUTH_TOKEN && this.env.TWILIO_PHONE_NUMBER)
    )

    const channels: EnabledChannels = {
      voice: voiceEnabled,
      sms: messagingConfig?.enabledChannels.includes('sms') ?? false,
      whatsapp: messagingConfig?.enabledChannels.includes('whatsapp') ?? false,
      signal: messagingConfig?.enabledChannels.includes('signal') ?? false,
      reports: setupState?.selectedChannels.includes('reports') ?? false,
    }

    return Response.json(channels)
  }

  // --- Telephony Provider ---

  private async getTelephonyProvider(): Promise<Response> {
    const config = await this.ctx.storage.get<TelephonyProviderConfig>('telephonyProvider')
    return Response.json(config || null)
  }

  private async updateTelephonyProvider(data: unknown): Promise<Response> {
    if (!data || typeof data !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
    }
    const config = data as TelephonyProviderConfig
    if (!config.type) {
      return new Response(JSON.stringify({ error: 'Provider type is required' }), { status: 400 })
    }
    const validTypes = ['twilio', 'signalwire', 'vonage', 'plivo', 'asterisk']
    if (!validTypes.includes(config.type)) {
      return new Response(JSON.stringify({ error: `Invalid provider type: ${config.type}` }), { status: 400 })
    }
    const required = PROVIDER_REQUIRED_FIELDS[config.type]
    for (const field of required) {
      if (!config[field]) {
        return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), { status: 400 })
      }
    }
    if (config.phoneNumber && !/^\+\d{7,15}$/.test(config.phoneNumber)) {
      return new Response(JSON.stringify({ error: 'Phone number must be in E.164 format' }), { status: 400 })
    }
    await this.ctx.storage.put('telephonyProvider', config)
    return Response.json(config)
  }

  // --- IVR Audio ---

  private static readonly VALID_PROMPT_TYPES = ['greeting', 'pleaseHold', 'waitMessage', 'rateLimited', 'captchaPrompt']
  private static readonly MAX_AUDIO_SIZE = 1_048_576

  private async getIvrAudioList(): Promise<Response> {
    const meta = await this.ctx.storage.get<Array<{ promptType: string; language: string; size: number; uploadedAt: string }>>('ivrAudioMeta') || []
    return Response.json({ recordings: meta })
  }

  private async uploadIvrAudio(promptType: string, language: string, data: ArrayBuffer): Promise<Response> {
    if (!SettingsDO.VALID_PROMPT_TYPES.includes(promptType)) {
      return new Response(JSON.stringify({ error: 'Invalid prompt type' }), { status: 400 })
    }
    if (data.byteLength > SettingsDO.MAX_AUDIO_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large (max 1MB)' }), { status: 400 })
    }
    if (data.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'Empty file' }), { status: 400 })
    }

    const key = `ivr-audio:${promptType}:${language}`
    await this.ctx.storage.put(key, new Uint8Array(data))

    const meta = await this.ctx.storage.get<Array<{ promptType: string; language: string; size: number; uploadedAt: string }>>('ivrAudioMeta') || []
    const existing = meta.findIndex(m => m.promptType === promptType && m.language === language)
    const entry = { promptType, language, size: data.byteLength, uploadedAt: new Date().toISOString() }
    if (existing >= 0) {
      meta[existing] = entry
    } else {
      meta.push(entry)
    }
    await this.ctx.storage.put('ivrAudioMeta', meta)
    return Response.json({ ok: true, ...entry })
  }

  private async getIvrAudio(promptType: string, language: string): Promise<Response> {
    const key = `ivr-audio:${promptType}:${language}`
    const data = await this.ctx.storage.get<Uint8Array>(key)
    if (!data) return new Response('Not Found', { status: 404 })
    return new Response(data.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': data.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  private async deleteIvrAudio(promptType: string, language: string): Promise<Response> {
    const key = `ivr-audio:${promptType}:${language}`
    await this.ctx.storage.delete(key)
    const meta = await this.ctx.storage.get<Array<{ promptType: string; language: string; size: number; uploadedAt: string }>>('ivrAudioMeta') || []
    await this.ctx.storage.put('ivrAudioMeta', meta.filter(m => !(m.promptType === promptType && m.language === language)))
    return Response.json({ ok: true })
  }
}
