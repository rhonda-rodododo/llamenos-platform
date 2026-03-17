/**
 * SettingsService — replaces SettingsDO.
 *
 * Manages system configuration, hubs, roles, entity type definitions,
 * IVR audio, rate limits, captchas, and case number sequences.
 * All state is stored in PostgreSQL via Drizzle ORM.
 */
import { eq, and, sql, lt } from 'drizzle-orm'
import type { Database } from '../db'
import {
  systemSettings,
  hubs as hubsTable,
  hubSettings as hubSettingsTable,
  hubKeys,
  roles as rolesTable,
  customFieldDefinitions,
  entityTypeDefinitions,
  relationshipTypeDefinitions,
  reportTypeDefinitions,
  ivrAudio,
  rateLimits,
  captchas,
  caseNumberSequences,
} from '../db/schema'
import type { SpamSettings, CallSettings } from '../types'
import type {
  CustomFieldDefinition,
  TelephonyProviderConfig,
  MessagingConfig,
  SetupState,
  EnabledChannels,
  Hub,
  ReportType,
} from '@shared/types'
import {
  MAX_CUSTOM_FIELDS,
  MAX_SELECT_OPTIONS,
  MAX_FIELD_NAME_LENGTH,
  MAX_FIELD_LABEL_LENGTH,
  MAX_OPTION_LENGTH,
  FIELD_NAME_REGEX,
  PROVIDER_REQUIRED_FIELDS,
  DEFAULT_MESSAGING_CONFIG,
  DEFAULT_SETUP_STATE,
  MAX_REPORT_TYPES,
  MAX_REPORT_TYPE_NAME_LENGTH,
  MAX_REPORT_TYPE_DESCRIPTION_LENGTH,
  DEFAULT_REPORT_TYPES,
  MAX_ENTITY_TYPES,
  MAX_RELATIONSHIP_TYPES,
} from '@shared/types'
import type {
  EntityTypeDefinition,
  EntityFieldDefinition,
  RelationshipTypeDefinition,
} from '@protocol/schemas/entity-schema'
import type {
  ReportTypeDefinition,
  ReportFieldDefinition,
} from '@protocol/schemas/report-types'
import { IVR_LANGUAGES } from '@shared/languages'
import type { Role } from '@shared/permissions'
import { DEFAULT_ROLES } from '@shared/permissions'
import {
  validateTTLOverrides,
  type TTLOverrides,
  type CleanupMetrics,
  emptyCleanupMetrics,
  resolveTTL,
} from '../lib/ttl'

// ---------------------------------------------------------------------------
// Result types — services return typed data, not Response objects
// ---------------------------------------------------------------------------

/** Thrown by service methods for known error conditions */
export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SINGLETON_ID = 1

const VALID_PROMPT_TYPES = [
  'greeting',
  'pleaseHold',
  'waitMessage',
  'rateLimited',
  'captchaPrompt',
] as const

const MAX_AUDIO_SIZE = 1_048_576 // 1 MB

const ALLOWED_HUB_SETTINGS = new Set([
  'hubName',
  'timezone',
  'language',
  'welcomeMessage',
  'emergencyMessage',
  'maxConcurrentCalls',
  'nostrRelayUrl',
  'callSettings',
  'spamSettings',
  'transcriptionEnabled',
])

const VALID_PROVIDER_TYPES = [
  'twilio',
  'signalwire',
  'vonage',
  'plivo',
  'asterisk',
] as const

const CAPTCHA_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Helper to get or upsert the system_settings singleton row
// ---------------------------------------------------------------------------

async function getSettings(db: Database) {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.id, SINGLETON_ID))
  if (rows.length > 0) return rows[0]

  // Upsert the singleton
  const [row] = await db
    .insert(systemSettings)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning()
  // If onConflictDoNothing didn't insert (race), re-read
  if (!row) {
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, SINGLETON_ID))
    return existing
  }
  return row
}

// ---------------------------------------------------------------------------
// SettingsService
// ---------------------------------------------------------------------------

export class SettingsService {
  private initialized = false

  constructor(protected db: Database) {}

  // =========================================================================
  // Initialization — seeds defaults for empty tables
  // =========================================================================

  async ensureInit(env?: {
    DEMO_MODE?: string
    ENVIRONMENT?: string
  }): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    const row = await getSettings(this.db)
    const spamSettings = row.spamSettings as SpamSettings | null

    // Seed spam settings if empty
    if (!spamSettings || Object.keys(spamSettings).length === 0) {
      await this.db
        .update(systemSettings)
        .set({
          spamSettings: {
            voiceCaptchaEnabled: false,
            rateLimitEnabled: true,
            maxCallsPerMinute: 3,
            blockDurationMinutes: 30,
          },
        })
        .where(eq(systemSettings.id, SINGLETON_ID))
    }

    // Seed call settings
    const callSettings = row.callSettings as CallSettings | null
    if (!callSettings || Object.keys(callSettings).length === 0) {
      await this.db
        .update(systemSettings)
        .set({
          callSettings: {
            queueTimeoutSeconds: 90,
            voicemailMaxSeconds: 120,
          },
        })
        .where(eq(systemSettings.id, SINGLETON_ID))
    }

    // Seed IVR languages
    if (!row.ivrLanguages || row.ivrLanguages.length === 0) {
      await this.db
        .update(systemSettings)
        .set({ ivrLanguages: [...IVR_LANGUAGES] })
        .where(eq(systemSettings.id, SINGLETON_ID))
    }

    // Seed default roles if none exist
    const existingRoles = await this.db.select().from(rolesTable)
    if (existingRoles.length === 0) {
      const now = new Date()
      for (const r of DEFAULT_ROLES) {
        await this.db.insert(rolesTable).values({
          id: r.id,
          name: r.name,
          slug: r.slug,
          permissions: r.permissions,
          isDefault: r.isDefault,
          isSystem: r.isSystem,
          description: r.description,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // Demo/development mode: mark setup complete, enable messaging
    if (env?.DEMO_MODE === 'true' || env?.ENVIRONMENT === 'development') {
      const isDemoMode = env.DEMO_MODE === 'true'
      const setupState = row.setupState as SetupState | null
      if (!setupState || !setupState.setupCompleted) {
        await this.db
          .update(systemSettings)
          .set({
            setupState: {
              setupCompleted: true,
              completedSteps: ['welcome', 'telephony', 'channels'],
              pendingChannels: [],
              selectedChannels: ['voice', 'sms', 'signal', 'reports'],
              demoMode: isDemoMode,
            },
          })
          .where(eq(systemSettings.id, SINGLETON_ID))
      }
      const msgConfig = row.messagingConfig as MessagingConfig | null
      if (!msgConfig || Object.keys(msgConfig).length === 0) {
        await this.db
          .update(systemSettings)
          .set({
            messagingConfig: {
              ...DEFAULT_MESSAGING_CONFIG,
              enabledChannels: ['sms', 'signal'],
            },
          })
          .where(eq(systemSettings.id, SINGLETON_ID))
      }
    }
  }

  // =========================================================================
  // Spam Settings
  // =========================================================================

  async getSpamSettings(): Promise<SpamSettings> {
    const row = await getSettings(this.db)
    return (row.spamSettings as SpamSettings) ?? {
      voiceCaptchaEnabled: false,
      rateLimitEnabled: true,
      maxCallsPerMinute: 3,
      blockDurationMinutes: 30,
    }
  }

  async updateSpamSettings(
    data: Partial<SpamSettings>,
  ): Promise<SpamSettings> {
    const current = await this.getSpamSettings()
    const updated = { ...current, ...data }
    await this.db
      .update(systemSettings)
      .set({ spamSettings: updated })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return updated
  }

  // =========================================================================
  // Transcription Settings
  // =========================================================================

  async getTranscriptionSettings(): Promise<{
    globalEnabled: boolean
    allowVolunteerOptOut: boolean
  }> {
    const row = await getSettings(this.db)
    return {
      globalEnabled: row.transcriptionEnabled ?? true,
      allowVolunteerOptOut: row.allowVolunteerTranscriptionOptOut ?? false,
    }
  }

  async updateTranscriptionSettings(data: {
    globalEnabled?: boolean
    allowVolunteerOptOut?: boolean
  }): Promise<{ globalEnabled: boolean; allowVolunteerOptOut: boolean }> {
    const updates: Record<string, unknown> = {}
    if (data.globalEnabled !== undefined)
      updates.transcriptionEnabled = data.globalEnabled
    if (data.allowVolunteerOptOut !== undefined)
      updates.allowVolunteerTranscriptionOptOut = data.allowVolunteerOptOut

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(systemSettings)
        .set(updates)
        .where(eq(systemSettings.id, SINGLETON_ID))
    }
    return this.getTranscriptionSettings()
  }

  // =========================================================================
  // Call Settings
  // =========================================================================

  async getCallSettings(): Promise<CallSettings> {
    const row = await getSettings(this.db)
    const settings = row.callSettings as CallSettings | null
    return settings ?? { queueTimeoutSeconds: 90, voicemailMaxSeconds: 120 }
  }

  async updateCallSettings(
    data: Partial<CallSettings>,
  ): Promise<CallSettings> {
    const current = await this.getCallSettings()
    const clamp = (v: number) => Math.max(30, Math.min(300, v))
    const updated: CallSettings = {
      queueTimeoutSeconds:
        data.queueTimeoutSeconds !== undefined
          ? clamp(data.queueTimeoutSeconds)
          : current.queueTimeoutSeconds,
      voicemailMaxSeconds:
        data.voicemailMaxSeconds !== undefined
          ? clamp(data.voicemailMaxSeconds)
          : current.voicemailMaxSeconds,
    }
    await this.db
      .update(systemSettings)
      .set({ callSettings: updated })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return updated
  }

  // =========================================================================
  // IVR Languages
  // =========================================================================

  async getIvrLanguages(): Promise<{ enabledLanguages: string[] }> {
    const row = await getSettings(this.db)
    return {
      enabledLanguages: row.ivrLanguages ?? [...IVR_LANGUAGES],
    }
  }

  async updateIvrLanguages(data: {
    enabledLanguages: string[]
  }): Promise<{ enabledLanguages: string[] }> {
    if (
      !Array.isArray(data.enabledLanguages) ||
      data.enabledLanguages.length === 0
    ) {
      throw new ServiceError(
        400,
        'At least one language must be enabled',
      )
    }
    const valid = data.enabledLanguages.filter((code) =>
      IVR_LANGUAGES.includes(code),
    )
    if (valid.length === 0) {
      throw new ServiceError(400, 'No valid IVR language codes provided')
    }
    await this.db
      .update(systemSettings)
      .set({ ivrLanguages: valid })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { enabledLanguages: valid }
  }

  // =========================================================================
  // Fallback Group
  // =========================================================================

  async getFallbackGroup(): Promise<{
    volunteerPubkeys: string[]
    volunteers: string[]
  }> {
    const row = await getSettings(this.db)
    const group = row.fallbackGroup ?? []
    return { volunteerPubkeys: group, volunteers: group }
  }

  async setFallbackGroup(data: {
    volunteerPubkeys: string[]
  }): Promise<{ ok: true }> {
    await this.db
      .update(systemSettings)
      .set({ fallbackGroup: data.volunteerPubkeys })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { ok: true }
  }

  // =========================================================================
  // Rate Limiting
  // =========================================================================

  async checkRateLimit(data: {
    key: string
    maxPerMinute: number
  }): Promise<{ limited: boolean }> {
    if (!data.key || !/^[a-zA-Z0-9:_-]{1,256}$/.test(data.key)) {
      throw new ServiceError(400, 'Invalid rate limit key')
    }
    if (
      !Number.isInteger(data.maxPerMinute) ||
      data.maxPerMinute < 1 ||
      data.maxPerMinute > 1000
    ) {
      throw new ServiceError(
        400,
        'maxPerMinute must be an integer between 1 and 1000',
      )
    }

    const now = Date.now()
    const windowMs = 60_000

    const [existing] = await this.db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, data.key))

    const timestamps = (existing?.timestamps as number[]) ?? []
    const recent = timestamps.filter((t) => now - t < windowMs)
    recent.push(now)

    if (existing) {
      await this.db
        .update(rateLimits)
        .set({ timestamps: recent })
        .where(eq(rateLimits.key, data.key))
    } else {
      await this.db
        .insert(rateLimits)
        .values({ key: data.key, timestamps: recent })
    }

    return { limited: recent.length >= data.maxPerMinute }
  }

  // =========================================================================
  // Custom Fields
  // =========================================================================

  async getCustomFields(
    role: string = 'admin',
  ): Promise<{ fields: CustomFieldDefinition[] }> {
    let rows = await this.db
      .select()
      .from(customFieldDefinitions)
      .orderBy(customFieldDefinitions.sortOrder)

    if (role !== 'admin') {
      rows = rows.filter((r) => r.visibleToVolunteers)
    }

    // Map DB rows to CustomFieldDefinition shape
    const fields: CustomFieldDefinition[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      label: r.label,
      type: r.fieldType as CustomFieldDefinition['type'],
      required: r.required ?? false,
      options: r.options ?? undefined,
      validation: r.validation as CustomFieldDefinition['validation'],
      visibleToVolunteers: r.visibleToVolunteers ?? true,
      editableByVolunteers: r.editableByVolunteers ?? true,
      context: r.context as CustomFieldDefinition['context'],
      maxFileSize: r.maxFileSize ?? undefined,
      allowedMimeTypes: r.allowedMimeTypes ?? undefined,
      maxFiles: r.maxFiles ?? 1,
      order: r.sortOrder ?? 0,
      createdAt: r.createdAt.toISOString(),
    }))

    return { fields }
  }

  async updateCustomFields(data: {
    fields: CustomFieldDefinition[]
  }): Promise<{ fields: CustomFieldDefinition[] }> {
    if (!data || !Array.isArray(data.fields)) {
      throw new ServiceError(
        400,
        'Invalid request: fields array required',
      )
    }

    const { fields } = data

    if (fields.length > MAX_CUSTOM_FIELDS) {
      throw new ServiceError(
        400,
        `Maximum ${MAX_CUSTOM_FIELDS} custom fields`,
      )
    }

    // Validate each field
    const names = new Set<string>()
    for (const field of fields) {
      if (!field.name || !field.label || !field.type) {
        throw new ServiceError(
          400,
          'Each field must have name, label, and type',
        )
      }
      if (!FIELD_NAME_REGEX.test(field.name)) {
        throw new ServiceError(
          400,
          `Invalid field name: ${field.name}. Use alphanumeric and underscores only.`,
        )
      }
      if (field.name.length > MAX_FIELD_NAME_LENGTH) {
        throw new ServiceError(
          400,
          `Field name too long: ${field.name}`,
        )
      }
      if (field.label.length > MAX_FIELD_LABEL_LENGTH) {
        throw new ServiceError(
          400,
          `Field label too long (max ${MAX_FIELD_LABEL_LENGTH} chars)`,
        )
      }
      if (names.has(field.name)) {
        throw new ServiceError(
          400,
          `Duplicate field name: ${field.name}`,
        )
      }
      names.add(field.name)
      if (
        !['text', 'number', 'select', 'checkbox', 'textarea', 'file'].includes(
          field.type,
        )
      ) {
        throw new ServiceError(
          400,
          `Invalid field type: ${field.type}`,
        )
      }
      if (field.type === 'select') {
        if (!field.options || field.options.length === 0) {
          throw new ServiceError(
            400,
            `Select field "${field.name}" must have options`,
          )
        }
        if (field.options.length > MAX_SELECT_OPTIONS) {
          throw new ServiceError(
            400,
            `Too many options for "${field.name}" (max ${MAX_SELECT_OPTIONS})`,
          )
        }
        for (const opt of field.options) {
          if (typeof opt !== 'string' || opt.length > MAX_OPTION_LENGTH) {
            throw new ServiceError(
              400,
              `Option too long in "${field.name}" (max ${MAX_OPTION_LENGTH} chars)`,
            )
          }
        }
      }
    }

    const validContexts = ['call-notes', 'conversation-notes', 'reports', 'all']
    const normalized = fields.map((f, i) => ({
      ...f,
      order: i,
      context:
        (f.context as string) === 'both'
          ? 'all'
          : validContexts.includes(f.context)
            ? f.context
            : 'all',
    }))

    // Replace all custom fields in a transaction
    await this.db.transaction(async (tx) => {
      await tx.delete(customFieldDefinitions)
      for (const [i, f] of normalized.entries()) {
        await tx.insert(customFieldDefinitions).values({
          id: f.id || crypto.randomUUID(),
          name: f.name,
          label: f.label,
          fieldType: f.type,
          required: f.required ?? false,
          options: f.options,
          validation: f.validation,
          visibleToVolunteers: f.visibleToVolunteers ?? true,
          editableByVolunteers: f.editableByVolunteers ?? true,
          context: f.context ?? 'all',
          maxFileSize: f.maxFileSize,
          allowedMimeTypes: f.allowedMimeTypes,
          maxFiles: f.maxFiles ?? 1,
          sortOrder: i,
        })
      }
    })

    return { fields: normalized as CustomFieldDefinition[] }
  }

  // =========================================================================
  // Messaging Config
  // =========================================================================

  async getMessagingConfig(): Promise<MessagingConfig> {
    const row = await getSettings(this.db)
    const config = row.messagingConfig as MessagingConfig | null
    return config && Object.keys(config).length > 0
      ? config
      : DEFAULT_MESSAGING_CONFIG
  }

  async updateMessagingConfig(
    data: Partial<MessagingConfig>,
  ): Promise<MessagingConfig> {
    const current = await this.getMessagingConfig()
    const updated = { ...current, ...data }

    if (updated.inactivityTimeout < 5 || updated.inactivityTimeout > 1440) {
      throw new ServiceError(
        400,
        'Inactivity timeout must be between 5 and 1440 minutes',
      )
    }
    if (
      updated.maxConcurrentPerVolunteer < 1 ||
      updated.maxConcurrentPerVolunteer > 20
    ) {
      throw new ServiceError(
        400,
        'Max concurrent must be between 1 and 20',
      )
    }

    await this.db
      .update(systemSettings)
      .set({ messagingConfig: updated })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return updated
  }

  // =========================================================================
  // Setup State
  // =========================================================================

  async getSetupState(): Promise<SetupState> {
    const row = await getSettings(this.db)
    const state = row.setupState as SetupState | null
    return state && Object.keys(state).length > 0
      ? state
      : DEFAULT_SETUP_STATE
  }

  async updateSetupState(data: Partial<SetupState>): Promise<SetupState> {
    const current = await this.getSetupState()
    const updated = { ...current, ...data }
    await this.db
      .update(systemSettings)
      .set({ setupState: updated })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return updated
  }

  // =========================================================================
  // Enabled Channels
  // =========================================================================

  async getEnabledChannels(env: {
    TWILIO_ACCOUNT_SID?: string
    TWILIO_AUTH_TOKEN?: string
    TWILIO_PHONE_NUMBER?: string
  }): Promise<EnabledChannels> {
    const row = await getSettings(this.db)
    const telephonyConfig = row.telephonyProvider as TelephonyProviderConfig | null
    const messagingConfig = row.messagingConfig as MessagingConfig | null
    const setupState = row.setupState as SetupState | null

    const voiceEnabled =
      !!telephonyConfig ||
      !!(
        env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN &&
        env.TWILIO_PHONE_NUMBER
      )

    return {
      voice: voiceEnabled,
      sms: messagingConfig?.enabledChannels.includes('sms') ?? false,
      whatsapp: messagingConfig?.enabledChannels.includes('whatsapp') ?? false,
      signal: messagingConfig?.enabledChannels.includes('signal') ?? false,
      rcs: messagingConfig?.enabledChannels.includes('rcs') ?? false,
      reports: setupState?.selectedChannels.includes('reports') ?? false,
    }
  }

  // =========================================================================
  // Report Categories (deprecated — use report types)
  // =========================================================================

  async getReportCategories(): Promise<{ categories: string[] }> {
    const row = await getSettings(this.db)
    return {
      categories: row.reportCategories ?? [
        'Incident Report',
        'Field Observation',
        'Evidence',
        'Other',
      ],
    }
  }

  async updateReportCategories(data: {
    categories: string[]
  }): Promise<{ categories: string[] }> {
    if (!Array.isArray(data.categories)) {
      throw new ServiceError(400, 'categories must be an array')
    }
    const categories = data.categories.slice(0, 50)
    await this.db
      .update(systemSettings)
      .set({ reportCategories: categories })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { categories }
  }

  // =========================================================================
  // Report Types CRUD
  // =========================================================================

  async getReportTypes(): Promise<{ reportTypes: ReportType[] }> {
    const row = await getSettings(this.db)
    let reportTypes = row.reportTypes as ReportType[] | null
    if (!reportTypes || reportTypes.length === 0) {
      const now = new Date().toISOString()
      reportTypes = DEFAULT_REPORT_TYPES.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        fields: [],
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      }))
      await this.db
        .update(systemSettings)
        .set({ reportTypes })
        .where(eq(systemSettings.id, SINGLETON_ID))
    }
    return { reportTypes }
  }

  async createReportType(data: Partial<ReportType>): Promise<ReportType> {
    if (!data || typeof data !== 'object') {
      throw new ServiceError(400, 'Invalid request body')
    }

    const { name, description, icon, fields, isDefault } = data

    if (!name || !name.trim()) {
      throw new ServiceError(400, 'Name is required')
    }
    if (name.length > MAX_REPORT_TYPE_NAME_LENGTH) {
      throw new ServiceError(
        400,
        `Name too long (max ${MAX_REPORT_TYPE_NAME_LENGTH} chars)`,
      )
    }
    if (description && description.length > MAX_REPORT_TYPE_DESCRIPTION_LENGTH) {
      throw new ServiceError(
        400,
        `Description too long (max ${MAX_REPORT_TYPE_DESCRIPTION_LENGTH} chars)`,
      )
    }

    const row = await getSettings(this.db)
    const reportTypes = (row.reportTypes as ReportType[]) ?? []

    if (reportTypes.filter((rt) => !rt.isArchived).length >= MAX_REPORT_TYPES) {
      throw new ServiceError(
        400,
        `Maximum ${MAX_REPORT_TYPES} active report types`,
      )
    }

    if (fields && fields.length > MAX_CUSTOM_FIELDS) {
      throw new ServiceError(
        400,
        `Maximum ${MAX_CUSTOM_FIELDS} fields per report type`,
      )
    }

    const now = new Date().toISOString()

    if (isDefault) {
      for (const rt of reportTypes) {
        rt.isDefault = false
      }
    }

    const reportType: ReportType = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: (description || '').trim(),
      icon: icon || undefined,
      fields: fields || [],
      isDefault: isDefault || false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }

    reportTypes.push(reportType)
    await this.db
      .update(systemSettings)
      .set({ reportTypes })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return reportType
  }

  async updateReportType(
    id: string,
    data: Partial<ReportType>,
  ): Promise<ReportType> {
    if (!data || typeof data !== 'object') {
      throw new ServiceError(400, 'Invalid request body')
    }

    const row = await getSettings(this.db)
    const reportTypes = (row.reportTypes as ReportType[]) ?? []
    const idx = reportTypes.findIndex((rt) => rt.id === id)
    if (idx === -1) {
      throw new ServiceError(404, 'Report type not found')
    }

    const rt = reportTypes[idx]

    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new ServiceError(400, 'Name cannot be empty')
      }
      if (data.name.length > MAX_REPORT_TYPE_NAME_LENGTH) {
        throw new ServiceError(
          400,
          `Name too long (max ${MAX_REPORT_TYPE_NAME_LENGTH} chars)`,
        )
      }
      rt.name = data.name.trim()
    }

    if (data.description !== undefined) {
      if (data.description.length > MAX_REPORT_TYPE_DESCRIPTION_LENGTH) {
        throw new ServiceError(
          400,
          `Description too long (max ${MAX_REPORT_TYPE_DESCRIPTION_LENGTH} chars)`,
        )
      }
      rt.description = data.description.trim()
    }

    if (data.icon !== undefined) rt.icon = data.icon || undefined
    if (data.fields !== undefined) {
      if (data.fields.length > MAX_CUSTOM_FIELDS) {
        throw new ServiceError(
          400,
          `Maximum ${MAX_CUSTOM_FIELDS} fields per report type`,
        )
      }
      rt.fields = data.fields
    }

    if (data.isDefault !== undefined) {
      if (data.isDefault) {
        for (const other of reportTypes) {
          other.isDefault = false
        }
      }
      rt.isDefault = data.isDefault
    }

    rt.updatedAt = new Date().toISOString()
    reportTypes[idx] = rt
    await this.db
      .update(systemSettings)
      .set({ reportTypes })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return rt
  }

  async archiveReportType(id: string): Promise<{ ok: true }> {
    const row = await getSettings(this.db)
    const reportTypes = (row.reportTypes as ReportType[]) ?? []
    const idx = reportTypes.findIndex((rt) => rt.id === id)
    if (idx === -1) {
      throw new ServiceError(404, 'Report type not found')
    }

    const activeCount = reportTypes.filter((rt) => !rt.isArchived).length
    if (activeCount <= 1 && !reportTypes[idx].isArchived) {
      throw new ServiceError(
        400,
        'Cannot archive the last active report type',
      )
    }

    reportTypes[idx].isArchived = true
    reportTypes[idx].isDefault = false
    reportTypes[idx].updatedAt = new Date().toISOString()

    if (!reportTypes.some((rt) => rt.isDefault && !rt.isArchived)) {
      const firstActive = reportTypes.find((rt) => !rt.isArchived)
      if (firstActive) firstActive.isDefault = true
    }

    await this.db
      .update(systemSettings)
      .set({ reportTypes })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { ok: true }
  }

  // =========================================================================
  // Telephony Provider
  // =========================================================================

  async getTelephonyProvider(): Promise<TelephonyProviderConfig | null> {
    const row = await getSettings(this.db)
    return (row.telephonyProvider as TelephonyProviderConfig) ?? null
  }

  async updateTelephonyProvider(
    data: TelephonyProviderConfig,
  ): Promise<TelephonyProviderConfig> {
    if (!data || typeof data !== 'object') {
      throw new ServiceError(400, 'Invalid request body')
    }
    if (!data.type) {
      throw new ServiceError(400, 'Provider type is required')
    }
    if (!(VALID_PROVIDER_TYPES as readonly string[]).includes(data.type)) {
      throw new ServiceError(
        400,
        `Invalid provider type: ${data.type}`,
      )
    }
    const required = PROVIDER_REQUIRED_FIELDS[data.type]
    for (const field of required) {
      if (!data[field]) {
        throw new ServiceError(400, `Missing required field: ${field}`)
      }
    }
    if (data.phoneNumber && !/^\+\d{7,15}$/.test(data.phoneNumber)) {
      throw new ServiceError(
        400,
        'Phone number must be in E.164 format',
      )
    }
    await this.db
      .update(systemSettings)
      .set({ telephonyProvider: data })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return data
  }

  // =========================================================================
  // IVR Audio
  // =========================================================================

  async getIvrAudioList(): Promise<{
    recordings: Array<{
      promptType: string
      language: string
      size: number
      uploadedAt: string
    }>
  }> {
    const rows = await this.db.select().from(ivrAudio)
    return {
      recordings: rows.map((r) => ({
        promptType: r.promptType,
        language: r.language,
        size: r.size,
        uploadedAt: r.uploadedAt.toISOString(),
      })),
    }
  }

  async uploadIvrAudio(
    promptType: string,
    language: string,
    audioBase64: string,
    size: number,
  ): Promise<{
    ok: true
    promptType: string
    language: string
    size: number
    uploadedAt: string
  }> {
    if (!(VALID_PROMPT_TYPES as readonly string[]).includes(promptType)) {
      throw new ServiceError(400, 'Invalid prompt type')
    }
    if (size > MAX_AUDIO_SIZE) {
      throw new ServiceError(400, 'File too large (max 1MB)')
    }
    if (size === 0) {
      throw new ServiceError(400, 'Empty file')
    }

    const now = new Date()

    await this.db
      .insert(ivrAudio)
      .values({
        promptType,
        language,
        audio: audioBase64,
        size,
        uploadedAt: now,
      })
      .onConflictDoUpdate({
        target: [ivrAudio.promptType, ivrAudio.language],
        set: {
          audio: audioBase64,
          size,
          uploadedAt: now,
        },
      })

    return {
      ok: true,
      promptType,
      language,
      size,
      uploadedAt: now.toISOString(),
    }
  }

  async getIvrAudio(
    promptType: string,
    language: string,
  ): Promise<{ audio: string; size: number } | null> {
    const [row] = await this.db
      .select()
      .from(ivrAudio)
      .where(
        and(
          eq(ivrAudio.promptType, promptType),
          eq(ivrAudio.language, language),
        ),
      )
    if (!row) return null
    return { audio: row.audio, size: row.size }
  }

  async deleteIvrAudio(
    promptType: string,
    language: string,
  ): Promise<{ ok: true }> {
    await this.db
      .delete(ivrAudio)
      .where(
        and(
          eq(ivrAudio.promptType, promptType),
          eq(ivrAudio.language, language),
        ),
      )
    return { ok: true }
  }

  // =========================================================================
  // Roles CRUD
  // =========================================================================

  async getRoles(): Promise<{ roles: Role[] }> {
    const rows = await this.db.select().from(rolesTable)
    const rolesList: Role[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      permissions: r.permissions,
      isDefault: r.isDefault ?? false,
      isSystem: r.isSystem ?? false,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
    return { roles: rolesList }
  }

  async createRole(data: Partial<Role>): Promise<Role> {
    if (!data || typeof data !== 'object') {
      throw new ServiceError(400, 'Invalid request')
    }
    const { name, slug, permissions, description } = data
    if (!name || !slug || !permissions || !description) {
      throw new ServiceError(
        400,
        'name, slug, permissions, and description are required',
      )
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ServiceError(
        400,
        'slug must be lowercase alphanumeric with hyphens',
      )
    }

    // Check slug uniqueness
    const [existing] = await this.db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.slug, slug))
    if (existing) {
      throw new ServiceError(
        409,
        `Role slug "${slug}" already exists`,
      )
    }

    const now = new Date()
    const id = `role-${crypto.randomUUID()}`

    await this.db.insert(rolesTable).values({
      id,
      name,
      slug,
      permissions: permissions as string[],
      isDefault: false,
      isSystem: false,
      description,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      name,
      slug,
      permissions: permissions as string[],
      isDefault: false,
      isSystem: false,
      description,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
  }

  async updateRole(id: string, data: Partial<Role>): Promise<Role> {
    const [existing] = await this.db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Role not found')
    }
    if (existing.isSystem) {
      throw new ServiceError(403, 'Cannot modify system roles')
    }

    const now = new Date()
    const updates: Record<string, unknown> = { updatedAt: now }
    if (data.name) updates.name = data.name
    if (data.description) updates.description = data.description
    if (data.permissions) updates.permissions = data.permissions as string[]

    await this.db
      .update(rolesTable)
      .set(updates)
      .where(eq(rolesTable.id, id))

    const [updated] = await this.db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      permissions: updated.permissions,
      isDefault: updated.isDefault ?? false,
      isSystem: updated.isSystem ?? false,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }

  async deleteRole(id: string): Promise<{ ok: true }> {
    const [existing] = await this.db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Role not found')
    }
    if (existing.isDefault) {
      throw new ServiceError(403, 'Cannot delete default roles')
    }

    await this.db.delete(rolesTable).where(eq(rolesTable.id, id))
    return { ok: true }
  }

  // =========================================================================
  // CAPTCHA Server-Side State
  // =========================================================================

  async storeCaptcha(data: {
    callSid: string
    expected: string
  }): Promise<{ ok: true }> {
    await this.db
      .insert(captchas)
      .values({
        callSid: data.callSid,
        expected: data.expected,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: captchas.callSid,
        set: {
          expected: data.expected,
          createdAt: new Date(),
        },
      })
    return { ok: true }
  }

  async verifyCaptcha(data: {
    callSid: string
    digits: string
  }): Promise<{ match: boolean; expected: string }> {
    const [stored] = await this.db
      .select()
      .from(captchas)
      .where(eq(captchas.callSid, data.callSid))

    // Always delete after first attempt (one-time use)
    await this.db.delete(captchas).where(eq(captchas.callSid, data.callSid))

    if (!stored) {
      return { match: false, expected: '' }
    }

    // Expire after 5 minutes
    if (Date.now() - stored.createdAt.getTime() > CAPTCHA_TTL_MS) {
      return { match: false, expected: stored.expected }
    }

    // Constant-time comparison
    const expected = stored.expected
    const digits = data.digits
    let match = expected.length === digits.length ? 1 : 0
    for (let i = 0; i < expected.length; i++) {
      match &= expected.charCodeAt(i) === digits.charCodeAt(i) ? 1 : 0
    }
    return { match: match === 1, expected }
  }

  // =========================================================================
  // TTL Overrides
  // =========================================================================

  async getTTLOverrides(): Promise<{ overrides: TTLOverrides }> {
    const row = await getSettings(this.db)
    return { overrides: (row.ttlOverrides as TTLOverrides) ?? {} }
  }

  async updateTTLOverrides(
    data: Record<string, unknown>,
  ): Promise<{ overrides: TTLOverrides }> {
    const error = validateTTLOverrides(data)
    if (error) {
      throw new ServiceError(400, error)
    }
    const row = await getSettings(this.db)
    const current = (row.ttlOverrides as TTLOverrides) ?? {}
    const updated: TTLOverrides = { ...current }
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number') {
        updated[key] = value
      }
    }
    await this.db
      .update(systemSettings)
      .set({ ttlOverrides: updated })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { overrides: updated }
  }

  // =========================================================================
  // Cleanup Metrics
  // =========================================================================

  async getCleanupMetrics(): Promise<CleanupMetrics> {
    const row = await getSettings(this.db)
    const metrics = row.cleanupMetrics as CleanupMetrics | null
    return metrics && Object.keys(metrics).length > 0
      ? metrics
      : emptyCleanupMetrics()
  }

  // =========================================================================
  // Hub Registry
  // =========================================================================

  async getHubs(): Promise<{ hubs: Hub[] }> {
    const rows = await this.db.select().from(hubsTable)
    const hubList: Hub[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description ?? '',
      status: r.status as Hub['status'],
      phoneNumber: r.phoneNumber ?? undefined,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
    return { hubs: hubList }
  }

  async createHub(hub: Hub): Promise<{ hub: Hub }> {
    // Check slug uniqueness
    const [existing] = await this.db
      .select()
      .from(hubsTable)
      .where(eq(hubsTable.slug, hub.slug))
    if (existing) {
      throw new ServiceError(409, 'Hub slug already exists')
    }

    const now = new Date()
    await this.db.insert(hubsTable).values({
      id: hub.id,
      name: hub.name,
      slug: hub.slug,
      description: hub.description,
      status: hub.status ?? 'active',
      phoneNumber: hub.phoneNumber,
      createdBy: hub.createdBy,
      createdAt: now,
      updatedAt: now,
    })

    // Create hub_settings row
    await this.db
      .insert(hubSettingsTable)
      .values({ hubId: hub.id, settings: {} })
      .onConflictDoNothing()

    return { hub }
  }

  async getHub(id: string): Promise<{ hub: Hub }> {
    const [row] = await this.db
      .select()
      .from(hubsTable)
      .where(eq(hubsTable.id, id))
    if (!row) {
      throw new ServiceError(404, 'Not found')
    }
    return {
      hub: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? '',
        status: row.status as Hub['status'],
        phoneNumber: row.phoneNumber ?? undefined,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    }
  }

  async updateHub(
    id: string,
    data: Partial<Hub>,
  ): Promise<{ hub: Hub }> {
    const [existing] = await this.db
      .select()
      .from(hubsTable)
      .where(eq(hubsTable.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Not found')
    }

    const now = new Date()
    const updates: Record<string, unknown> = { updatedAt: now }
    if (data.name !== undefined) updates.name = data.name
    if (data.slug !== undefined) updates.slug = data.slug
    if (data.description !== undefined) updates.description = data.description
    if (data.status !== undefined) updates.status = data.status
    if (data.phoneNumber !== undefined) updates.phoneNumber = data.phoneNumber

    await this.db
      .update(hubsTable)
      .set(updates)
      .where(eq(hubsTable.id, id))

    const [updated] = await this.db
      .select()
      .from(hubsTable)
      .where(eq(hubsTable.id, id))

    return {
      hub: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description ?? '',
        status: updated.status as Hub['status'],
        phoneNumber: updated.phoneNumber ?? undefined,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }
  }

  async archiveHub(id: string): Promise<{ ok: true }> {
    const [existing] = await this.db
      .select()
      .from(hubsTable)
      .where(eq(hubsTable.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Not found')
    }

    await this.db
      .update(hubsTable)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(hubsTable.id, id))
    return { ok: true }
  }

  async getHubSettings(
    hubId: string,
  ): Promise<Record<string, unknown>> {
    const [row] = await this.db
      .select()
      .from(hubSettingsTable)
      .where(eq(hubSettingsTable.hubId, hubId))
    return (row?.settings as Record<string, unknown>) ?? {}
  }

  async updateHubSettings(
    hubId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Strip unknown keys
    const sanitized: Record<string, unknown> = {}
    for (const key of Object.keys(data)) {
      if (ALLOWED_HUB_SETTINGS.has(key)) {
        sanitized[key] = data[key]
      }
    }

    const existing = await this.getHubSettings(hubId)
    const merged = { ...existing, ...sanitized }

    await this.db
      .insert(hubSettingsTable)
      .values({ hubId, settings: merged })
      .onConflictDoUpdate({
        target: hubSettingsTable.hubId,
        set: { settings: merged },
      })

    return merged
  }

  async getHubTelephonyProvider(
    hubId: string,
  ): Promise<TelephonyProviderConfig | null> {
    const [row] = await this.db
      .select()
      .from(hubSettingsTable)
      .where(eq(hubSettingsTable.hubId, hubId))
    return (row?.telephonyProvider as TelephonyProviderConfig) ?? null
  }

  async setHubTelephonyProvider(
    hubId: string,
    config: TelephonyProviderConfig,
  ): Promise<{ ok: true }> {
    if (!config || typeof config !== 'object') {
      throw new ServiceError(400, 'Invalid request body')
    }
    if (!config.type) {
      throw new ServiceError(400, 'Provider type is required')
    }
    if (!(VALID_PROVIDER_TYPES as readonly string[]).includes(config.type)) {
      throw new ServiceError(
        400,
        `Invalid provider type: ${config.type}`,
      )
    }
    const required = PROVIDER_REQUIRED_FIELDS[config.type]
    for (const field of required) {
      if (!config[field]) {
        throw new ServiceError(400, `Missing required field: ${field}`)
      }
    }
    if (config.phoneNumber && !/^\+\d{7,15}$/.test(config.phoneNumber)) {
      throw new ServiceError(
        400,
        'Phone number must be in E.164 format',
      )
    }

    await this.db
      .insert(hubSettingsTable)
      .values({ hubId, telephonyProvider: config })
      .onConflictDoUpdate({
        target: hubSettingsTable.hubId,
        set: { telephonyProvider: config },
      })
    return { ok: true }
  }

  async getHubByPhone(
    phone: string,
  ): Promise<{ hub: Hub }> {
    const [row] = await this.db
      .select()
      .from(hubsTable)
      .where(
        and(eq(hubsTable.phoneNumber, phone), eq(hubsTable.status, 'active')),
      )
    if (!row) {
      throw new ServiceError(404, 'No hub for this number')
    }
    return {
      hub: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? '',
        status: row.status as Hub['status'],
        phoneNumber: row.phoneNumber ?? undefined,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    }
  }

  // =========================================================================
  // Hub Key Management
  // =========================================================================

  async getHubKeyEnvelopes(hubId: string): Promise<{
    envelopes: Array<{
      pubkey: string
      wrappedKey: string
      ephemeralPubkey: string
    }>
  }> {
    const rows = await this.db
      .select()
      .from(hubKeys)
      .where(eq(hubKeys.hubId, hubId))

    return {
      envelopes: rows.map((r) => ({
        pubkey: r.recipientPubkey,
        wrappedKey: r.wrappedKey,
        ephemeralPubkey: r.ephemeralPubkey,
      })),
    }
  }

  async setHubKeyEnvelopes(
    hubId: string,
    data: {
      envelopes: Array<{
        pubkey: string
        wrappedKey: string
        ephemeralPubkey: string
      }>
    },
  ): Promise<{ ok: true }> {
    // Validate hub exists
    const [hub] = await this.db
      .select()
      .from(hubsTable)
      .where(eq(hubsTable.id, hubId))
    if (!hub) {
      throw new ServiceError(404, 'Hub not found')
    }

    // Replace all envelopes in a transaction
    await this.db.transaction(async (tx) => {
      await tx.delete(hubKeys).where(eq(hubKeys.hubId, hubId))
      for (const envelope of data.envelopes) {
        await tx.insert(hubKeys).values({
          hubId,
          recipientPubkey: envelope.pubkey,
          wrappedKey: envelope.wrappedKey,
          ephemeralPubkey: envelope.ephemeralPubkey,
        })
      }
    })

    return { ok: true }
  }

  // =========================================================================
  // Case Management — Entity Type Definitions (Epic 315)
  // =========================================================================

  async getCaseManagementEnabled(): Promise<{ enabled: boolean }> {
    const row = await getSettings(this.db)
    return { enabled: row.caseManagementEnabled ?? false }
  }

  async setCaseManagementEnabled(data: {
    enabled: boolean
  }): Promise<{ enabled: boolean }> {
    const enabled = !!data.enabled
    await this.db
      .update(systemSettings)
      .set({ caseManagementEnabled: enabled })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { enabled }
  }

  // =========================================================================
  // Cross-Hub Sharing (Epic 328)
  // =========================================================================

  async getCrossHubSharingEnabled(): Promise<{ enabled: boolean }> {
    const row = await getSettings(this.db)
    return { enabled: row.crossHubSharingEnabled ?? false }
  }

  async setCrossHubSharingEnabled(data: {
    enabled: boolean
  }): Promise<{ enabled: boolean }> {
    const enabled = !!data.enabled
    await this.db
      .update(systemSettings)
      .set({ crossHubSharingEnabled: enabled })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { enabled }
  }

  // =========================================================================
  // Entity Types
  // =========================================================================

  async getEntityTypes(): Promise<{
    entityTypes: EntityTypeDefinition[]
  }> {
    const rows = await this.db.select().from(entityTypeDefinitions)
    return {
      entityTypes: rows.map((r) => this.rowToEntityType(r)),
    }
  }

  async getEntityTypeById(
    id: string,
  ): Promise<EntityTypeDefinition> {
    const [row] = await this.db
      .select()
      .from(entityTypeDefinitions)
      .where(eq(entityTypeDefinitions.id, id))
    if (!row) {
      throw new ServiceError(404, 'Entity type not found')
    }
    return this.rowToEntityType(row)
  }

  async createEntityType(
    data: Record<string, unknown>,
  ): Promise<EntityTypeDefinition> {
    const count = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(entityTypeDefinitions)
    if (Number(count[0].count) >= MAX_ENTITY_TYPES) {
      throw new ServiceError(
        400,
        `Maximum of ${MAX_ENTITY_TYPES} entity types allowed`,
      )
    }

    const name = data.name as string
    // Check for duplicate name (non-archived)
    const [dup] = await this.db
      .select()
      .from(entityTypeDefinitions)
      .where(
        and(
          eq(entityTypeDefinitions.name, name),
          eq(entityTypeDefinitions.isArchived, false),
        ),
      )
    if (dup) {
      throw new ServiceError(
        409,
        `Entity type with name "${name}" already exists`,
      )
    }

    const now = new Date()
    const id = crypto.randomUUID()

    // Assign IDs to fields
    const fields = ((data.fields as EntityFieldDefinition[]) ?? []).map(
      (f) => ({
        ...f,
        id: f.id || crypto.randomUUID(),
      }),
    )

    await this.db.insert(entityTypeDefinitions).values({
      id,
      hubId: (data.hubId as string) ?? '',
      name,
      label: (data.label as string) ?? name,
      labelPlural: (data.labelPlural as string) ?? '',
      description: (data.description as string) ?? '',
      icon: data.icon as string | undefined,
      color: data.color as string | undefined,
      category: (data.category as string) ?? 'case',
      templateId: data.templateId as string | undefined,
      templateVersion: data.templateVersion as string | undefined,
      fields,
      statuses: (data.statuses as unknown[]) ?? [],
      defaultStatus: (data.defaultStatus as string) ?? '',
      closedStatuses: (data.closedStatuses as string[]) ?? [],
      severities: data.severities as unknown,
      defaultSeverity: data.defaultSeverity as string | undefined,
      categories: data.categories as unknown,
      contactRoles: data.contactRoles as unknown,
      numberPrefix: data.numberPrefix as string | undefined,
      numberingEnabled: (data.numberingEnabled as boolean) ?? false,
      defaultAccessLevel: (data.defaultAccessLevel as string) ?? 'assigned',
      piiFields: (data.piiFields as string[]) ?? [],
      allowSubRecords: (data.allowSubRecords as boolean) ?? false,
      allowFileAttachments: (data.allowFileAttachments as boolean) ?? true,
      allowInteractionLinks: (data.allowInteractionLinks as boolean) ?? true,
      showInNavigation: (data.showInNavigation as boolean) ?? true,
      showInDashboard: (data.showInDashboard as boolean) ?? true,
      accessRoles: data.accessRoles as string[] | undefined,
      editRoles: data.editRoles as string[] | undefined,
      isArchived: false,
      isSystem: (data.isSystem as boolean) ?? false,
      createdAt: now,
      updatedAt: now,
    })

    const [created] = await this.db
      .select()
      .from(entityTypeDefinitions)
      .where(eq(entityTypeDefinitions.id, id))
    return this.rowToEntityType(created)
  }

  async updateEntityType(
    id: string,
    data: Record<string, unknown>,
  ): Promise<EntityTypeDefinition> {
    const [existing] = await this.db
      .select()
      .from(entityTypeDefinitions)
      .where(eq(entityTypeDefinitions.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Entity type not found')
    }

    // Assign IDs to new fields
    if (data.fields && Array.isArray(data.fields)) {
      data.fields = (data.fields as EntityFieldDefinition[]).map((f) => ({
        ...f,
        id: f.id || crypto.randomUUID(),
      }))
    }

    const now = new Date()
    const updates: Record<string, unknown> = { updatedAt: now }

    // Map through all possible update fields
    const fieldMap: Record<string, string> = {
      name: 'name',
      label: 'label',
      labelPlural: 'labelPlural',
      description: 'description',
      icon: 'icon',
      color: 'color',
      category: 'category',
      fields: 'fields',
      statuses: 'statuses',
      defaultStatus: 'defaultStatus',
      closedStatuses: 'closedStatuses',
      severities: 'severities',
      defaultSeverity: 'defaultSeverity',
      categories: 'categories',
      contactRoles: 'contactRoles',
      numberPrefix: 'numberPrefix',
      numberingEnabled: 'numberingEnabled',
      defaultAccessLevel: 'defaultAccessLevel',
      piiFields: 'piiFields',
      allowSubRecords: 'allowSubRecords',
      allowFileAttachments: 'allowFileAttachments',
      allowInteractionLinks: 'allowInteractionLinks',
      showInNavigation: 'showInNavigation',
      showInDashboard: 'showInDashboard',
      accessRoles: 'accessRoles',
      editRoles: 'editRoles',
      isArchived: 'isArchived',
      isSystem: 'isSystem',
      templateId: 'templateId',
      templateVersion: 'templateVersion',
    }

    for (const [dataKey, dbKey] of Object.entries(fieldMap)) {
      if (data[dataKey] !== undefined) {
        updates[dbKey] = data[dataKey]
      }
    }

    await this.db
      .update(entityTypeDefinitions)
      .set(updates)
      .where(eq(entityTypeDefinitions.id, id))

    const [updated] = await this.db
      .select()
      .from(entityTypeDefinitions)
      .where(eq(entityTypeDefinitions.id, id))
    return this.rowToEntityType(updated)
  }

  async bulkSetEntityTypes(data: {
    entityTypes: EntityTypeDefinition[]
  }): Promise<{ entityTypes: EntityTypeDefinition[] }> {
    await this.db.transaction(async (tx) => {
      await tx.delete(entityTypeDefinitions)
      for (const et of data.entityTypes) {
        const now = new Date()
        await tx.insert(entityTypeDefinitions).values({
          id: et.id,
          hubId: et.hubId ?? '',
          name: et.name,
          label: et.label,
          labelPlural: et.labelPlural ?? '',
          description: et.description ?? '',
          icon: et.icon,
          color: et.color,
          category: et.category ?? 'case',
          templateId: et.templateId,
          templateVersion: et.templateVersion,
          fields: et.fields ?? [],
          statuses: et.statuses ?? [],
          defaultStatus: et.defaultStatus ?? '',
          closedStatuses: et.closedStatuses ?? [],
          severities: et.severities,
          defaultSeverity: et.defaultSeverity,
          categories: et.categories,
          contactRoles: et.contactRoles,
          numberPrefix: et.numberPrefix,
          numberingEnabled: et.numberingEnabled ?? false,
          defaultAccessLevel: et.defaultAccessLevel ?? 'assigned',
          piiFields: et.piiFields ?? [],
          allowSubRecords: et.allowSubRecords ?? false,
          allowFileAttachments: et.allowFileAttachments ?? true,
          allowInteractionLinks: et.allowInteractionLinks ?? true,
          showInNavigation: et.showInNavigation ?? true,
          showInDashboard: et.showInDashboard ?? true,
          accessRoles: et.accessRoles,
          editRoles: et.editRoles,
          isArchived: et.isArchived ?? false,
          isSystem: et.isSystem ?? false,
          createdAt: et.createdAt ? new Date(et.createdAt) : now,
          updatedAt: et.updatedAt ? new Date(et.updatedAt) : now,
        })
      }
    })
    return { entityTypes: data.entityTypes }
  }

  async deleteEntityType(id: string): Promise<{ deleted: true }> {
    const result = await this.db
      .delete(entityTypeDefinitions)
      .where(eq(entityTypeDefinitions.id, id))
      .returning()
    if (result.length === 0) {
      throw new ServiceError(404, 'Entity type not found')
    }
    return { deleted: true }
  }

  // =========================================================================
  // Relationship Types
  // =========================================================================

  async getRelationshipTypes(): Promise<{
    relationshipTypes: RelationshipTypeDefinition[]
  }> {
    const rows = await this.db.select().from(relationshipTypeDefinitions)
    return {
      relationshipTypes: rows.map((r) => this.rowToRelationshipType(r)),
    }
  }

  async createRelationshipType(
    data: Record<string, unknown>,
  ): Promise<RelationshipTypeDefinition> {
    const count = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(relationshipTypeDefinitions)
    if (Number(count[0].count) >= MAX_RELATIONSHIP_TYPES) {
      throw new ServiceError(
        400,
        `Maximum of ${MAX_RELATIONSHIP_TYPES} relationship types allowed`,
      )
    }

    const now = new Date()
    const id = crypto.randomUUID()

    await this.db.insert(relationshipTypeDefinitions).values({
      id,
      hubId: (data.hubId as string) ?? '',
      sourceEntityTypeId: data.sourceEntityTypeId as string | undefined,
      targetEntityTypeId: data.targetEntityTypeId as string | undefined,
      cardinality: (data.cardinality as string) ?? 'M:N',
      label: data.label as string,
      reverseLabel: (data.reverseLabel as string) ?? '',
      sourceLabel: (data.sourceLabel as string) ?? '',
      targetLabel: (data.targetLabel as string) ?? '',
      roles: data.roles as unknown,
      defaultRole: data.defaultRole as string | undefined,
      joinFields: data.joinFields as unknown,
      cascadeDelete: (data.cascadeDelete as boolean) ?? false,
      required: (data.required as boolean) ?? false,
      templateId: data.templateId as string | undefined,
      isSystem: (data.isSystem as boolean) ?? false,
      createdAt: now,
      updatedAt: now,
    })

    const [created] = await this.db
      .select()
      .from(relationshipTypeDefinitions)
      .where(eq(relationshipTypeDefinitions.id, id))
    return this.rowToRelationshipType(created)
  }

  async updateRelationshipType(
    id: string,
    data: Record<string, unknown>,
  ): Promise<RelationshipTypeDefinition> {
    const [existing] = await this.db
      .select()
      .from(relationshipTypeDefinitions)
      .where(eq(relationshipTypeDefinitions.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Relationship type not found')
    }

    const now = new Date()
    const updates: Record<string, unknown> = { updatedAt: now }

    const fieldMap: Record<string, string> = {
      sourceEntityTypeId: 'sourceEntityTypeId',
      targetEntityTypeId: 'targetEntityTypeId',
      cardinality: 'cardinality',
      label: 'label',
      reverseLabel: 'reverseLabel',
      sourceLabel: 'sourceLabel',
      targetLabel: 'targetLabel',
      roles: 'roles',
      defaultRole: 'defaultRole',
      joinFields: 'joinFields',
      cascadeDelete: 'cascadeDelete',
      required: 'required',
      templateId: 'templateId',
      isSystem: 'isSystem',
    }

    for (const [dataKey, dbKey] of Object.entries(fieldMap)) {
      if (data[dataKey] !== undefined) {
        updates[dbKey] = data[dataKey]
      }
    }

    await this.db
      .update(relationshipTypeDefinitions)
      .set(updates)
      .where(eq(relationshipTypeDefinitions.id, id))

    const [updated] = await this.db
      .select()
      .from(relationshipTypeDefinitions)
      .where(eq(relationshipTypeDefinitions.id, id))
    return this.rowToRelationshipType(updated)
  }

  async bulkSetRelationshipTypes(data: {
    relationshipTypes: RelationshipTypeDefinition[]
  }): Promise<{ relationshipTypes: RelationshipTypeDefinition[] }> {
    await this.db.transaction(async (tx) => {
      await tx.delete(relationshipTypeDefinitions)
      for (const rt of data.relationshipTypes) {
        const now = new Date()
        await tx.insert(relationshipTypeDefinitions).values({
          id: rt.id,
          hubId: rt.hubId ?? '',
          sourceEntityTypeId: rt.sourceEntityTypeId,
          targetEntityTypeId: rt.targetEntityTypeId,
          cardinality: rt.cardinality ?? 'M:N',
          label: rt.label,
          reverseLabel: rt.reverseLabel ?? '',
          sourceLabel: rt.sourceLabel ?? '',
          targetLabel: rt.targetLabel ?? '',
          roles: rt.roles,
          defaultRole: rt.defaultRole,
          joinFields: rt.joinFields,
          cascadeDelete: rt.cascadeDelete ?? false,
          required: rt.required ?? false,
          templateId: rt.templateId,
          isSystem: rt.isSystem ?? false,
          createdAt: rt.createdAt ? new Date(rt.createdAt) : now,
          updatedAt: rt.updatedAt ? new Date(rt.updatedAt) : now,
        })
      }
    })
    return { relationshipTypes: data.relationshipTypes }
  }

  async deleteRelationshipType(id: string): Promise<{ deleted: true }> {
    const result = await this.db
      .delete(relationshipTypeDefinitions)
      .where(eq(relationshipTypeDefinitions.id, id))
      .returning()
    if (result.length === 0) {
      throw new ServiceError(404, 'Relationship type not found')
    }
    return { deleted: true }
  }

  // =========================================================================
  // Case Number Sequence
  // =========================================================================

  async generateCaseNumber(data: {
    prefix: string
    year?: number
  }): Promise<{ number: string; sequence: number }> {
    const year = data.year ?? new Date().getFullYear()

    // Use upsert with RETURNING to atomically get the next value
    const [result] = await this.db
      .insert(caseNumberSequences)
      .values({ prefix: data.prefix, year, nextValue: 1 })
      .onConflictDoUpdate({
        target: [caseNumberSequences.prefix, caseNumberSequences.year],
        set: {
          nextValue: sql`${caseNumberSequences.nextValue} + 1`,
        },
      })
      .returning()

    const sequence = result.nextValue
    return {
      number: `${data.prefix}-${year}-${String(sequence).padStart(4, '0')}`,
      sequence,
    }
  }

  // =========================================================================
  // Applied Templates
  // =========================================================================

  async getAppliedTemplates(): Promise<{
    appliedTemplates: unknown[]
  }> {
    const row = await getSettings(this.db)
    return {
      appliedTemplates: (row.appliedTemplates as unknown[]) ?? [],
    }
  }

  async setAppliedTemplates(data: {
    appliedTemplates: unknown[]
  }): Promise<{ ok: true }> {
    await this.db
      .update(systemSettings)
      .set({ appliedTemplates: data.appliedTemplates })
      .where(eq(systemSettings.id, SINGLETON_ID))
    return { ok: true }
  }

  // =========================================================================
  // CMS Report Type Definitions (Epic 343)
  // =========================================================================

  async getCmsReportTypes(): Promise<{
    reportTypes: ReportTypeDefinition[]
  }> {
    const rows = await this.db.select().from(reportTypeDefinitions)
    return {
      reportTypes: rows.map((r) => this.rowToReportTypeDefinition(r)),
    }
  }

  async getCmsReportTypeById(
    id: string,
  ): Promise<ReportTypeDefinition> {
    const [row] = await this.db
      .select()
      .from(reportTypeDefinitions)
      .where(eq(reportTypeDefinitions.id, id))
    if (!row) {
      throw new ServiceError(404, 'Report type not found')
    }
    return this.rowToReportTypeDefinition(row)
  }

  async createCmsReportType(
    data: Record<string, unknown>,
  ): Promise<ReportTypeDefinition> {
    const count = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(reportTypeDefinitions)
    if (Number(count[0].count) >= MAX_ENTITY_TYPES) {
      throw new ServiceError(
        400,
        `Maximum of ${MAX_ENTITY_TYPES} report type definitions allowed`,
      )
    }

    const name = data.name as string
    const [dup] = await this.db
      .select()
      .from(reportTypeDefinitions)
      .where(
        and(
          eq(reportTypeDefinitions.name, name),
          eq(reportTypeDefinitions.isArchived, false),
        ),
      )
    if (dup) {
      throw new ServiceError(
        409,
        `Report type with name "${name}" already exists`,
      )
    }

    const now = new Date()
    const id = crypto.randomUUID()

    const fields = ((data.fields as ReportFieldDefinition[]) ?? []).map(
      (f) => ({
        ...f,
        id: f.id || crypto.randomUUID(),
      }),
    )

    await this.db.insert(reportTypeDefinitions).values({
      id,
      hubId: (data.hubId as string) ?? '',
      name,
      label: (data.label as string) ?? name,
      labelPlural: (data.labelPlural as string) ?? '',
      description: (data.description as string) ?? '',
      icon: data.icon as string | undefined,
      color: data.color as string | undefined,
      fields,
      statuses: (data.statuses as unknown[]) ?? [],
      defaultStatus: (data.defaultStatus as string) ?? '',
      closedStatuses: (data.closedStatuses as string[]) ?? [],
      allowCaseConversion: (data.allowCaseConversion as boolean) ?? false,
      mobileOptimized: (data.mobileOptimized as boolean) ?? false,
      templateId: data.templateId as string | undefined,
      isArchived: false,
      isSystem: (data.isSystem as boolean) ?? false,
      createdAt: now,
      updatedAt: now,
    })

    const [created] = await this.db
      .select()
      .from(reportTypeDefinitions)
      .where(eq(reportTypeDefinitions.id, id))
    return this.rowToReportTypeDefinition(created)
  }

  async updateCmsReportType(
    id: string,
    data: Record<string, unknown>,
  ): Promise<ReportTypeDefinition> {
    const [existing] = await this.db
      .select()
      .from(reportTypeDefinitions)
      .where(eq(reportTypeDefinitions.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Report type not found')
    }

    // Assign IDs to new fields
    if (data.fields && Array.isArray(data.fields)) {
      data.fields = (data.fields as ReportFieldDefinition[]).map((f) => ({
        ...f,
        id: f.id || crypto.randomUUID(),
      }))
    }

    const now = new Date()
    const updates: Record<string, unknown> = { updatedAt: now }

    const fieldMap: Record<string, string> = {
      name: 'name',
      label: 'label',
      labelPlural: 'labelPlural',
      description: 'description',
      icon: 'icon',
      color: 'color',
      fields: 'fields',
      statuses: 'statuses',
      defaultStatus: 'defaultStatus',
      closedStatuses: 'closedStatuses',
      allowCaseConversion: 'allowCaseConversion',
      mobileOptimized: 'mobileOptimized',
      templateId: 'templateId',
      isArchived: 'isArchived',
      isSystem: 'isSystem',
    }

    for (const [dataKey, dbKey] of Object.entries(fieldMap)) {
      if (data[dataKey] !== undefined) {
        updates[dbKey] = data[dataKey]
      }
    }

    await this.db
      .update(reportTypeDefinitions)
      .set(updates)
      .where(eq(reportTypeDefinitions.id, id))

    const [updated] = await this.db
      .select()
      .from(reportTypeDefinitions)
      .where(eq(reportTypeDefinitions.id, id))
    return this.rowToReportTypeDefinition(updated)
  }

  async bulkSetCmsReportTypes(data: {
    reportTypes: ReportTypeDefinition[]
  }): Promise<{ reportTypes: ReportTypeDefinition[] }> {
    await this.db.transaction(async (tx) => {
      await tx.delete(reportTypeDefinitions)
      for (const rt of data.reportTypes) {
        const now = new Date()
        await tx.insert(reportTypeDefinitions).values({
          id: rt.id,
          hubId: rt.hubId ?? '',
          name: rt.name,
          label: rt.label,
          labelPlural: rt.labelPlural ?? '',
          description: rt.description ?? '',
          icon: rt.icon,
          color: rt.color,
          fields: rt.fields ?? [],
          statuses: rt.statuses ?? [],
          defaultStatus: rt.defaultStatus ?? '',
          closedStatuses: rt.closedStatuses ?? [],
          allowCaseConversion: rt.allowCaseConversion ?? false,
          mobileOptimized: rt.mobileOptimized ?? false,
          templateId: rt.templateId,
          isArchived: rt.isArchived ?? false,
          isSystem: rt.isSystem ?? false,
          createdAt: rt.createdAt ? new Date(rt.createdAt) : now,
          updatedAt: rt.updatedAt ? new Date(rt.updatedAt) : now,
        })
      }
    })
    return { reportTypes: data.reportTypes }
  }

  async deleteCmsReportType(
    id: string,
  ): Promise<{ archived: true; id: string }> {
    const [existing] = await this.db
      .select()
      .from(reportTypeDefinitions)
      .where(eq(reportTypeDefinitions.id, id))
    if (!existing) {
      throw new ServiceError(404, 'Report type not found')
    }

    // Soft delete: mark as archived
    await this.db
      .update(reportTypeDefinitions)
      .set({
        isArchived: true,
        updatedAt: new Date(),
      })
      .where(eq(reportTypeDefinitions.id, id))

    return { archived: true, id }
  }

  // =========================================================================
  // Periodic Cleanup (replaces DO alarm)
  // =========================================================================

  /**
   * Run periodic cleanup of expired rate limits and captchas.
   * Called by the task scheduler instead of DO alarms.
   */
  async runCleanup(): Promise<CleanupMetrics> {
    const row = await getSettings(this.db)
    const overrides = (row.ttlOverrides as TTLOverrides) ?? {}
    const metrics =
      (row.cleanupMetrics as CleanupMetrics) ?? emptyCleanupMetrics()
    const now = Date.now()

    // Clean up expired rate limit entries
    const rateLimitTTL = resolveTTL('rateLimit', overrides)
    const allRateLimits = await this.db.select().from(rateLimits)
    for (const rl of allRateLimits) {
      const timestamps = rl.timestamps as number[]
      const recent = timestamps.filter((t) => now - t < rateLimitTTL)
      if (recent.length === 0) {
        await this.db
          .delete(rateLimits)
          .where(eq(rateLimits.key, rl.key))
        metrics.rateLimitEntriesDeleted++
      } else {
        await this.db
          .update(rateLimits)
          .set({ timestamps: recent })
          .where(eq(rateLimits.key, rl.key))
      }
    }

    // Clean up expired CAPTCHA challenges
    const captchaTTL = resolveTTL('captchaChallenge', overrides)
    const cutoff = new Date(now - captchaTTL)
    const deleted = await this.db
      .delete(captchas)
      .where(lt(captchas.createdAt, cutoff))
      .returning()
    metrics.captchaChallengesDeleted += deleted.length

    metrics.lastCleanupAt = new Date().toISOString()
    await this.db
      .update(systemSettings)
      .set({ cleanupMetrics: metrics })
      .where(eq(systemSettings.id, SINGLETON_ID))

    return metrics
  }

  // =========================================================================
  // Test Reset (demo/development only)
  // =========================================================================

  async reset(env: {
    DEMO_MODE?: string
    ENVIRONMENT?: string
  }): Promise<{ ok: true }> {
    if (env.DEMO_MODE !== 'true' && env.ENVIRONMENT !== 'development') {
      throw new ServiceError(
        403,
        'Reset not allowed outside demo/development mode',
      )
    }

    await this.db.transaction(async (tx) => {
      // Clear all settings tables
      await tx.delete(customFieldDefinitions)
      await tx.delete(entityTypeDefinitions)
      await tx.delete(relationshipTypeDefinitions)
      await tx.delete(reportTypeDefinitions)
      await tx.delete(ivrAudio)
      await tx.delete(rateLimits)
      await tx.delete(captchas)
      await tx.delete(caseNumberSequences)
      await tx.delete(hubKeys)
      await tx.delete(hubSettingsTable)
      await tx.delete(hubsTable)
      await tx.delete(rolesTable)
      await tx.delete(systemSettings)
    })

    this.initialized = false
    await this.ensureInit(env)
    return { ok: true }
  }

  // =========================================================================
  // Private helpers — row → domain type mappers
  // =========================================================================

  private rowToEntityType(
    r: typeof entityTypeDefinitions.$inferSelect,
  ): EntityTypeDefinition {
    return {
      id: r.id,
      hubId: r.hubId,
      name: r.name,
      label: r.label,
      labelPlural: r.labelPlural,
      description: r.description,
      icon: r.icon ?? undefined,
      color: r.color ?? undefined,
      category: r.category as EntityTypeDefinition['category'],
      templateId: r.templateId ?? undefined,
      templateVersion: r.templateVersion ?? undefined,
      fields: (r.fields as EntityFieldDefinition[]) ?? [],
      statuses: (r.statuses as EntityTypeDefinition['statuses']) ?? [],
      defaultStatus: r.defaultStatus,
      closedStatuses: r.closedStatuses ?? [],
      severities: r.severities as EntityTypeDefinition['severities'],
      defaultSeverity: r.defaultSeverity ?? undefined,
      categories: r.categories as EntityTypeDefinition['categories'],
      contactRoles: r.contactRoles as EntityTypeDefinition['contactRoles'],
      numberPrefix: r.numberPrefix ?? undefined,
      numberingEnabled: r.numberingEnabled ?? false,
      defaultAccessLevel:
        (r.defaultAccessLevel as EntityTypeDefinition['defaultAccessLevel']) ??
        'assigned',
      piiFields: r.piiFields ?? [],
      allowSubRecords: r.allowSubRecords ?? false,
      allowFileAttachments: r.allowFileAttachments ?? true,
      allowInteractionLinks: r.allowInteractionLinks ?? true,
      showInNavigation: r.showInNavigation ?? true,
      showInDashboard: r.showInDashboard ?? true,
      accessRoles: r.accessRoles ?? undefined,
      editRoles: r.editRoles ?? undefined,
      isArchived: r.isArchived ?? false,
      isSystem: r.isSystem ?? false,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    } as EntityTypeDefinition
  }

  private rowToRelationshipType(
    r: typeof relationshipTypeDefinitions.$inferSelect,
  ): RelationshipTypeDefinition {
    return {
      id: r.id,
      hubId: r.hubId,
      sourceEntityTypeId: r.sourceEntityTypeId ?? undefined,
      targetEntityTypeId: r.targetEntityTypeId ?? undefined,
      cardinality:
        (r.cardinality as RelationshipTypeDefinition['cardinality']) ?? 'M:N',
      label: r.label,
      reverseLabel: r.reverseLabel,
      sourceLabel: r.sourceLabel,
      targetLabel: r.targetLabel,
      roles: r.roles as RelationshipTypeDefinition['roles'],
      defaultRole: r.defaultRole ?? undefined,
      joinFields: r.joinFields as RelationshipTypeDefinition['joinFields'],
      cascadeDelete: r.cascadeDelete ?? false,
      required: r.required ?? false,
      templateId: r.templateId ?? undefined,
      isSystem: r.isSystem ?? false,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    } as RelationshipTypeDefinition
  }

  private rowToReportTypeDefinition(
    r: typeof reportTypeDefinitions.$inferSelect,
  ): ReportTypeDefinition {
    return {
      id: r.id,
      hubId: r.hubId,
      name: r.name,
      label: r.label,
      labelPlural: r.labelPlural,
      description: r.description,
      icon: r.icon ?? undefined,
      color: r.color ?? undefined,
      category: 'report',
      fields: (r.fields as ReportFieldDefinition[]) ?? [],
      statuses: (r.statuses as ReportTypeDefinition['statuses']) ?? [],
      defaultStatus: r.defaultStatus,
      closedStatuses: r.closedStatuses ?? [],
      allowCaseConversion: r.allowCaseConversion ?? false,
      mobileOptimized: r.mobileOptimized ?? false,
      templateId: r.templateId ?? undefined,
      isArchived: r.isArchived ?? false,
      isSystem: r.isSystem ?? false,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    } as ReportTypeDefinition
  }
}
