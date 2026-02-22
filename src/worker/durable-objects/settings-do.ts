import { DurableObject } from 'cloudflare:workers'
import type { Env, SpamSettings, CallSettings } from '../types'
import type { CustomFieldDefinition, TelephonyProviderConfig, MessagingConfig, SetupState, EnabledChannels, Hub } from '../../shared/types'
import { MAX_CUSTOM_FIELDS, MAX_SELECT_OPTIONS, MAX_FIELD_NAME_LENGTH, MAX_FIELD_LABEL_LENGTH, MAX_OPTION_LENGTH, FIELD_NAME_REGEX, PROVIDER_REQUIRED_FIELDS, DEFAULT_MESSAGING_CONFIG, DEFAULT_SETUP_STATE } from '../../shared/types'
import { IVR_LANGUAGES } from '../../shared/languages'
import { DORouter } from '../lib/do-router'
import { runMigrations } from '../../shared/migrations/runner'
import { migrations } from '../../shared/migrations'
import type { Role } from '../../shared/permissions'
import { DEFAULT_ROLES } from '../../shared/permissions'

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
  private migrated = false
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

    // --- Report Categories ---
    this.router.get('/settings/report-categories', () => this.getReportCategories())
    this.router.put('/settings/report-categories', async (req) => this.updateReportCategories(await req.json()))

    // --- Fallback Group ---
    this.router.get('/fallback', () => this.getFallbackGroup())
    this.router.put('/fallback', async (req) => this.setFallbackGroup(await req.json()))

    // --- Roles ---
    this.router.get('/settings/roles', () => this.getRoles())
    this.router.post('/settings/roles', async (req) => this.createRole(await req.json()))
    this.router.patch('/settings/roles/:id', async (req, { id }) => this.updateRole(id, await req.json()))
    this.router.delete('/settings/roles/:id', (_req, { id }) => this.deleteRole(id))

    // --- Rate Limiting ---
    this.router.post('/rate-limit/check', async (req) => this.checkRateLimit(await req.json()))

    // --- CAPTCHA state (server-side storage of expected digits) ---
    this.router.post('/captcha/store', async (req) => this.storeCaptcha(await req.json()))
    this.router.post('/captcha/verify', async (req) => this.verifyCaptcha(await req.json()))

    // --- Hub Registry ---
    this.router.get('/settings/hubs', () => this.getHubs())
    this.router.post('/settings/hubs', async (req) => this.createHub(await req.json()))
    this.router.get('/settings/hub/:id', (_req, { id }) => this.getHub(id))
    this.router.patch('/settings/hub/:id', async (req, { id }) => this.updateHub(id, await req.json()))
    this.router.delete('/settings/hub/:id', (_req, { id }) => this.archiveHub(id))
    this.router.get('/settings/hub/:id/settings', (_req, { id }) => this.getHubSettings(id))
    this.router.put('/settings/hub/:id/settings', async (req, { id }) => this.updateHubSettings(id, await req.json()))
    this.router.get('/settings/hub/:hubId/telephony-provider', (_req, { hubId }) => this.getHubTelephonyProvider(hubId))
    this.router.put('/settings/hub/:hubId/telephony-provider', async (req, { hubId }) => this.setHubTelephonyProvider(hubId, await req.json()))
    this.router.get('/settings/hub-by-phone/:phone', (_req, { phone }) => this.getHubByPhone(phone))

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
    // Seed default roles if not present
    if (!(await this.ctx.storage.get<Role[]>('roles'))) {
      const now = new Date().toISOString()
      const roles: Role[] = DEFAULT_ROLES.map(r => ({
        ...r,
        createdAt: now,
        updatedAt: now,
      }))
      await this.ctx.storage.put('roles', roles)
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.migrated) {
      await runMigrations(this.ctx.storage, migrations, 'settings')
      this.migrated = true
    }
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
    let fields = await this.ctx.storage.get<CustomFieldDefinition[]>('customFields') || []
    if (role !== 'admin') {
      fields = fields.filter(f => f.visibleToVolunteers)
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

    const validContexts = ['call-notes', 'reports', 'both']
    const normalized = fields.map((f, i) => ({
      ...f,
      order: i,
      context: validContexts.includes(f.context) ? f.context : 'both',
    }))
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

  // --- Report Categories ---

  private async getReportCategories(): Promise<Response> {
    const categories = await this.ctx.storage.get<string[]>('reportCategories') || ['Incident Report', 'Field Observation', 'Evidence', 'Other']
    return Response.json({ categories })
  }

  private async updateReportCategories(data: { categories: string[] }): Promise<Response> {
    if (!Array.isArray(data.categories)) {
      return new Response(JSON.stringify({ error: 'categories must be an array' }), { status: 400 })
    }
    const categories = data.categories.slice(0, 50) // max 50 categories
    await this.ctx.storage.put('reportCategories', categories)
    return Response.json({ categories })
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

  // --- Roles CRUD ---

  private async getRoles(): Promise<Response> {
    const roles = await this.ctx.storage.get<Role[]>('roles') || []
    return Response.json({ roles })
  }

  private async createRole(data: unknown): Promise<Response> {
    if (!data || typeof data !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 })
    }
    const { name, slug, permissions, description } = data as Partial<Role>
    if (!name || !slug || !permissions || !description) {
      return new Response(JSON.stringify({ error: 'name, slug, permissions, and description are required' }), { status: 400 })
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return new Response(JSON.stringify({ error: 'slug must be lowercase alphanumeric with hyphens' }), { status: 400 })
    }
    const roles = await this.ctx.storage.get<Role[]>('roles') || []
    if (roles.some(r => r.slug === slug)) {
      return new Response(JSON.stringify({ error: `Role slug "${slug}" already exists` }), { status: 409 })
    }
    const now = new Date().toISOString()
    const role: Role = {
      id: `role-${crypto.randomUUID()}`,
      name,
      slug,
      permissions: permissions as string[],
      isDefault: false,
      isSystem: false,
      description,
      createdAt: now,
      updatedAt: now,
    }
    roles.push(role)
    await this.ctx.storage.put('roles', roles)
    return Response.json(role, { status: 201 })
  }

  private async updateRole(id: string, data: unknown): Promise<Response> {
    const roles = await this.ctx.storage.get<Role[]>('roles') || []
    const idx = roles.findIndex(r => r.id === id)
    if (idx === -1) return new Response(JSON.stringify({ error: 'Role not found' }), { status: 404 })

    const role = roles[idx]
    if (role.isSystem) {
      return new Response(JSON.stringify({ error: 'Cannot modify system roles' }), { status: 403 })
    }

    const updates = data as Partial<Role>
    if (updates.name) role.name = updates.name
    if (updates.description) role.description = updates.description
    if (updates.permissions) role.permissions = updates.permissions as string[]
    role.updatedAt = new Date().toISOString()

    roles[idx] = role
    await this.ctx.storage.put('roles', roles)
    return Response.json(role)
  }

  private async deleteRole(id: string): Promise<Response> {
    const roles = await this.ctx.storage.get<Role[]>('roles') || []
    const role = roles.find(r => r.id === id)
    if (!role) return new Response(JSON.stringify({ error: 'Role not found' }), { status: 404 })
    if (role.isDefault) {
      return new Response(JSON.stringify({ error: 'Cannot delete default roles' }), { status: 403 })
    }

    await this.ctx.storage.put('roles', roles.filter(r => r.id !== id))
    return Response.json({ ok: true })
  }

  // --- CAPTCHA Server-Side State ---

  private async storeCaptcha(data: { callSid: string; expected: string }): Promise<Response> {
    const key = `captcha:${data.callSid}`
    // Store with creation time for expiry
    await this.ctx.storage.put(key, { expected: data.expected, createdAt: Date.now() })
    // Schedule cleanup alarm
    try { await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000) } catch { /* alarm already set */ }
    return Response.json({ ok: true })
  }

  private async verifyCaptcha(data: { callSid: string; digits: string }): Promise<Response> {
    const key = `captcha:${data.callSid}`
    const stored = await this.ctx.storage.get<{ expected: string; createdAt: number }>(key)
    // Always delete after first verification attempt (one-time use)
    await this.ctx.storage.delete(key)

    if (!stored) {
      return Response.json({ match: false, expected: '' })
    }

    // Expire after 5 minutes
    if (Date.now() - stored.createdAt > 5 * 60 * 1000) {
      return Response.json({ match: false, expected: stored.expected })
    }

    // Constant-time comparison
    const expected = stored.expected
    const digits = data.digits
    let match = expected.length === digits.length ? 1 : 0
    for (let i = 0; i < expected.length; i++) {
      match &= expected.charCodeAt(i) === digits.charCodeAt(i) ? 1 : 0
    }
    return Response.json({ match: match === 1, expected })
  }

  // --- Hub Registry Methods ---

  private async getHubs(): Promise<Response> {
    const hubs = await this.ctx.storage.get<Hub[]>('hubs') || []
    return Response.json({ hubs })
  }

  private async createHub(hub: Hub): Promise<Response> {
    const hubs = await this.ctx.storage.get<Hub[]>('hubs') || []
    // Check slug uniqueness
    if (hubs.some(h => h.slug === hub.slug)) {
      return Response.json({ error: 'Hub slug already exists' }, { status: 409 })
    }
    hubs.push(hub)
    await this.ctx.storage.put('hubs', hubs)
    return Response.json({ hub })
  }

  private async getHub(id: string): Promise<Response> {
    const hubs = await this.ctx.storage.get<Hub[]>('hubs') || []
    const hub = hubs.find(h => h.id === id)
    if (!hub) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ hub })
  }

  private async updateHub(id: string, data: Partial<Hub>): Promise<Response> {
    const hubs = await this.ctx.storage.get<Hub[]>('hubs') || []
    const idx = hubs.findIndex(h => h.id === id)
    if (idx === -1) return Response.json({ error: 'Not found' }, { status: 404 })
    hubs[idx] = { ...hubs[idx], ...data, updatedAt: new Date().toISOString() }
    await this.ctx.storage.put('hubs', hubs)
    return Response.json({ hub: hubs[idx] })
  }

  private async archiveHub(id: string): Promise<Response> {
    const hubs = await this.ctx.storage.get<Hub[]>('hubs') || []
    const idx = hubs.findIndex(h => h.id === id)
    if (idx === -1) return Response.json({ error: 'Not found' }, { status: 404 })
    hubs[idx].status = 'archived'
    hubs[idx].updatedAt = new Date().toISOString()
    await this.ctx.storage.put('hubs', hubs)
    return Response.json({ ok: true })
  }

  private async getHubSettings(hubId: string): Promise<Response> {
    const settings = await this.ctx.storage.get<Record<string, unknown>>(`hub:${hubId}:settings`) || {}
    return Response.json(settings)
  }

  private async updateHubSettings(hubId: string, data: Record<string, unknown>): Promise<Response> {
    const existing = await this.ctx.storage.get<Record<string, unknown>>(`hub:${hubId}:settings`) || {}
    const merged = { ...existing, ...data }
    await this.ctx.storage.put(`hub:${hubId}:settings`, merged)
    return Response.json(merged)
  }

  private async getHubTelephonyProvider(hubId: string): Promise<Response> {
    const config = await this.ctx.storage.get(`hub:${hubId}:telephony-provider`)
    return Response.json(config || null)
  }

  private async setHubTelephonyProvider(hubId: string, config: unknown): Promise<Response> {
    await this.ctx.storage.put(`hub:${hubId}:telephony-provider`, config)
    return Response.json({ ok: true })
  }

  private async getHubByPhone(phone: string): Promise<Response> {
    const hubs = await this.ctx.storage.get<Hub[]>('hubs') || []
    const hub = hubs.find(h => h.phoneNumber === phone && h.status === 'active')
    if (!hub) return Response.json({ error: 'No hub for this number' }, { status: 404 })
    return Response.json({ hub })
  }
}
