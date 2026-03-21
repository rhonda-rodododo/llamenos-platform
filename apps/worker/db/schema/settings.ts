/**
 * Settings domain tables: system settings, hubs, hub settings/keys,
 * roles, custom fields, entity/relationship/report type definitions,
 * IVR audio, rate limits, captchas, case number sequences.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'

// ---------------------------------------------------------------------------
// system_settings (singleton, id always = 1)
// ---------------------------------------------------------------------------

export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey().default(1),
  spamSettings: jsonb('spam_settings').notNull().default({}),
  callSettings: jsonb('call_settings').notNull().default({}),
  transcriptionEnabled: boolean('transcription_enabled').default(true),
  allowUserTranscriptionOptOut: boolean(
    'allow_user_transcription_opt_out',
  ).default(false),
  ivrLanguages: text('ivr_languages')
    .array()
    .default(sql`'{}'::text[]`),
  messagingConfig: jsonb('messaging_config').notNull().default({}),
  telephonyProvider: jsonb('telephony_provider'),
  setupState: jsonb('setup_state').notNull().default({}),
  webauthnSettings: jsonb('webauthn_settings').notNull().default({}),
  caseManagementEnabled: boolean('case_management_enabled').default(false),
  crossHubSharingEnabled: boolean('cross_hub_sharing_enabled').default(false),
  autoAssignmentSettings: jsonb('auto_assignment_settings')
    .notNull()
    .default({}),
  crossHubSettings: jsonb('cross_hub_settings').notNull().default({}),
  ttlOverrides: jsonb('ttl_overrides').notNull().default({}),
  appliedTemplates: jsonb('applied_templates').notNull().default([]),
  fallbackGroup: text('fallback_group')
    .array()
    .default(sql`'{}'::text[]`),
  reportCategories: text('report_categories')
    .array()
    .default(
      sql`'{"Incident Report","Field Observation","Evidence","Other"}'::text[]`,
    ),
  reportTypes: jsonb('report_types').notNull().default([]),
  cmsReportTypes: jsonb('cms_report_types').notNull().default([]),
  ivrAudioMeta: jsonb('ivr_audio_meta').notNull().default([]),
  cleanupMetrics: jsonb('cleanup_metrics').notNull().default({}),
})

// ---------------------------------------------------------------------------
// hubs
// ---------------------------------------------------------------------------

export const hubs = pgTable('hubs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  phoneNumber: text('phone_number'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// hub_settings
// ---------------------------------------------------------------------------

export const hubSettings = pgTable('hub_settings', {
  hubId: text('hub_id')
    .primaryKey()
    .references(() => hubs.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').notNull().default({}),
  telephonyProvider: jsonb('telephony_provider'),
  phoneNumber: text('phone_number'),
})

// ---------------------------------------------------------------------------
// hub_keys (composite PK: hub_id + recipient_pubkey)
// ---------------------------------------------------------------------------

export const hubKeys = pgTable(
  'hub_keys',
  {
    hubId: text('hub_id')
      .notNull()
      .references(() => hubs.id, { onDelete: 'cascade' }),
    recipientPubkey: text('recipient_pubkey').notNull(),
    wrappedKey: text('wrapped_key').notNull(),
    ephemeralPubkey: text('ephemeral_pubkey').notNull(),
  },
  (t) => [primaryKey({ columns: [t.hubId, t.recipientPubkey] })],
)

// ---------------------------------------------------------------------------
// roles
// ---------------------------------------------------------------------------

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  permissions: text('permissions')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  isDefault: boolean('is_default').default(false),
  isSystem: boolean('is_system').default(false),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// custom_field_definitions
// ---------------------------------------------------------------------------

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull(),
  required: boolean('required').default(false),
  options: text('options').array(),
  validation: jsonb('validation'),
  visibleToUsers: boolean('visible_to_users').default(true),
  editableByUsers: boolean('editable_by_users').default(true),
  context: text('context').notNull().default('all'),
  maxFileSize: integer('max_file_size'),
  allowedMimeTypes: text('allowed_mime_types').array(),
  maxFiles: integer('max_files').default(1),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// entity_type_definitions
// ---------------------------------------------------------------------------

export const entityTypeDefinitions = pgTable('entity_type_definitions', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull().default(''),
  name: text('name').notNull(),
  label: text('label').notNull(),
  labelPlural: text('label_plural').notNull().default(''),
  description: text('description').notNull().default(''),
  icon: text('icon'),
  color: text('color'),
  category: text('category').notNull().default('case'),
  templateId: text('template_id'),
  templateVersion: text('template_version'),
  fields: jsonb('fields').notNull().default([]),
  statuses: jsonb('statuses').notNull().default([]),
  defaultStatus: text('default_status').notNull().default(''),
  closedStatuses: text('closed_statuses')
    .array()
    .default(sql`'{}'::text[]`),
  severities: jsonb('severities'),
  defaultSeverity: text('default_severity'),
  categories: jsonb('categories'),
  contactRoles: jsonb('contact_roles'),
  numberPrefix: text('number_prefix'),
  numberingEnabled: boolean('numbering_enabled').default(false),
  defaultAccessLevel: text('default_access_level')
    .notNull()
    .default('assigned'),
  piiFields: text('pii_fields')
    .array()
    .default(sql`'{}'::text[]`),
  allowSubRecords: boolean('allow_sub_records').default(false),
  allowFileAttachments: boolean('allow_file_attachments').default(true),
  allowInteractionLinks: boolean('allow_interaction_links').default(true),
  showInNavigation: boolean('show_in_navigation').default(true),
  showInDashboard: boolean('show_in_dashboard').default(true),
  accessRoles: text('access_roles').array(),
  editRoles: text('edit_roles').array(),
  isArchived: boolean('is_archived').default(false),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// relationship_type_definitions
// ---------------------------------------------------------------------------

export const relationshipTypeDefinitions = pgTable(
  'relationship_type_definitions',
  {
    id: text('id').primaryKey(),
    hubId: text('hub_id').notNull().default(''),
    sourceEntityTypeId: text('source_entity_type_id'),
    targetEntityTypeId: text('target_entity_type_id'),
    cardinality: text('cardinality').notNull().default('M:N'),
    label: text('label').notNull(),
    reverseLabel: text('reverse_label').notNull().default(''),
    sourceLabel: text('source_label').notNull().default(''),
    targetLabel: text('target_label').notNull().default(''),
    roles: jsonb('roles'),
    defaultRole: text('default_role'),
    joinFields: jsonb('join_fields'),
    cascadeDelete: boolean('cascade_delete').default(false),
    required: boolean('required').default(false),
    templateId: text('template_id'),
    isSystem: boolean('is_system').default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
)

// ---------------------------------------------------------------------------
// report_type_definitions
// ---------------------------------------------------------------------------

export const reportTypeDefinitions = pgTable('report_type_definitions', {
  id: text('id').primaryKey(),
  hubId: text('hub_id').notNull().default(''),
  name: text('name').notNull(),
  label: text('label').notNull(),
  labelPlural: text('label_plural').notNull().default(''),
  description: text('description').notNull().default(''),
  icon: text('icon'),
  color: text('color'),
  fields: jsonb('fields').notNull().default([]),
  statuses: jsonb('statuses').notNull().default([]),
  defaultStatus: text('default_status').notNull().default(''),
  closedStatuses: text('closed_statuses')
    .array()
    .default(sql`'{}'::text[]`),
  allowCaseConversion: boolean('allow_case_conversion').default(false),
  mobileOptimized: boolean('mobile_optimized').default(false),
  templateId: text('template_id'),
  isArchived: boolean('is_archived').default(false),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// ivr_audio (composite PK: prompt_type + language)
// ---------------------------------------------------------------------------

export const ivrAudio = pgTable(
  'ivr_audio',
  {
    promptType: text('prompt_type').notNull(),
    language: text('language').notNull(),
    audio: text('audio').notNull(),
    size: integer('size').notNull().default(0),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.promptType, t.language] })],
)

// ---------------------------------------------------------------------------
// rate_limits
// ---------------------------------------------------------------------------

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  timestamps: jsonb('timestamps').notNull().default([]),
})

// ---------------------------------------------------------------------------
// captchas
// ---------------------------------------------------------------------------

export const captchas = pgTable('captchas', {
  callSid: text('call_sid').primaryKey(),
  expected: text('expected').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ---------------------------------------------------------------------------
// case_number_sequences (composite PK: hub_id + prefix + year)
// ---------------------------------------------------------------------------

export const caseNumberSequences = pgTable(
  'case_number_sequences',
  {
    hubId: text('hub_id').notNull().default(''),
    prefix: text('prefix').notNull(),
    year: integer('year').notNull(),
    nextValue: integer('next_value').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.hubId, t.prefix, t.year] })],
)
