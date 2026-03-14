import { z } from 'zod'

// --- Reusable building blocks ---

export const enumOptionSchema = z.object({
  value: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(50),
  label: z.string().max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  order: z.number().int().min(0),
  isDefault: z.boolean().optional(),
  isClosed: z.boolean().optional(),
  isDeprecated: z.boolean().optional(),
})

export type EnumOption = z.infer<typeof enumOptionSchema>

// --- Conditional visibility rule ---

const showWhenSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'is_set']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
})

// --- Field option (for select/multiselect) ---

const fieldOptionSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
  label: z.string().max(200),
})

// --- Entity Field Definition ---

export const entityFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().regex(/^[a-zA-Z0-9_]+$/).max(50),
  label: z.string().max(200),
  type: z.enum([
    'text', 'number', 'select', 'multiselect', 'checkbox',
    'textarea', 'date', 'file',
  ]),
  required: z.boolean().default(false),
  options: z.array(fieldOptionSchema).max(50).optional(),
  lookupId: z.string().optional(),
  validation: z.object({
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).optional(),
  section: z.string().max(100).optional(),
  helpText: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  order: z.number().int().min(0),

  // Blind index configuration
  indexable: z.boolean().default(false),
  indexType: z.enum(['exact', 'none']).default('none'),

  // Access control
  accessLevel: z.enum(['all', 'admin', 'assigned', 'custom']).default('all'),
  accessRoles: z.array(z.string()).optional(),

  // Visibility rules
  visibleToVolunteers: z.boolean().default(true),
  editableByVolunteers: z.boolean().default(true),

  // Conditional display
  showWhen: showWhenSchema.optional(),

  // Template tracking
  templateId: z.string().optional(),
  hubEditable: z.boolean().default(true),
})

export type EntityFieldDefinition = z.infer<typeof entityFieldDefinitionSchema>

// --- Entity category ---

export const entityCategorySchema = z.enum(['contact', 'case', 'event', 'custom'])
export type EntityCategory = z.infer<typeof entityCategorySchema>

// --- Entity Type Definition (full record, stored in SettingsDO) ---

export const entityTypeDefinitionSchema = z.object({
  id: z.string().uuid(),
  hubId: z.string(),

  name: z.string().regex(/^[a-zA-Z0-9_]+$/).max(100),
  label: z.string().max(200),
  labelPlural: z.string().max(200),
  description: z.string().max(1000),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  category: entityCategorySchema,

  templateId: z.string().optional(),
  templateVersion: z.string().optional(),

  fields: z.array(entityFieldDefinitionSchema).max(100),

  statuses: z.array(enumOptionSchema).min(1).max(50),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()),

  severities: z.array(enumOptionSchema).max(20).optional(),
  defaultSeverity: z.string().optional(),

  categories: z.array(enumOptionSchema).max(50).optional(),

  contactRoles: z.array(enumOptionSchema).max(20).optional(),

  numberPrefix: z.string().regex(/^[A-Z]{1,5}$/).optional(),
  numberingEnabled: z.boolean().default(false),

  defaultAccessLevel: z.enum(['assigned', 'team', 'hub']).default('assigned'),
  piiFields: z.array(z.string()).default([]),

  allowSubRecords: z.boolean().default(false),
  allowFileAttachments: z.boolean().default(true),
  allowInteractionLinks: z.boolean().default(true),
  showInNavigation: z.boolean().default(true),
  showInDashboard: z.boolean().default(false),

  accessRoles: z.array(z.string()).optional(),
  editRoles: z.array(z.string()).optional(),

  isArchived: z.boolean().default(false),
  isSystem: z.boolean().default(false),

  createdAt: z.string(),
  updatedAt: z.string(),
})

export type EntityTypeDefinition = z.infer<typeof entityTypeDefinitionSchema>

// --- Relationship Type Definition ---

export const relationshipTypeDefinitionSchema = z.object({
  id: z.string().uuid(),
  hubId: z.string(),

  sourceEntityTypeId: z.string(),
  targetEntityTypeId: z.string(),

  cardinality: z.enum(['1:1', '1:N', 'M:N']),

  label: z.string().max(200),
  reverseLabel: z.string().max(200),
  sourceLabel: z.string().max(200),
  targetLabel: z.string().max(200),

  roles: z.array(enumOptionSchema).max(20).optional(),
  defaultRole: z.string().optional(),

  joinFields: z.array(entityFieldDefinitionSchema).max(20).optional(),

  cascadeDelete: z.boolean().default(false),
  required: z.boolean().default(false),

  templateId: z.string().optional(),
  isSystem: z.boolean().default(false),

  createdAt: z.string(),
  updatedAt: z.string(),
})

export type RelationshipTypeDefinition = z.infer<typeof relationshipTypeDefinitionSchema>

// --- Input schemas for CRUD ---

export const createEntityTypeBodySchema = z.looseObject({
  name: z.string().regex(/^[a-zA-Z0-9_]+$/).max(100),
  label: z.string().min(1).max(200),
  labelPlural: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  category: entityCategorySchema,

  fields: z.array(entityFieldDefinitionSchema.omit({ id: true }).extend({
    id: z.string().uuid().optional(),
  })).max(100).default([]),

  statuses: z.array(enumOptionSchema).min(1).max(50),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()).default([]),

  severities: z.array(enumOptionSchema).max(20).optional(),
  defaultSeverity: z.string().optional(),

  categories: z.array(enumOptionSchema).max(50).optional(),
  contactRoles: z.array(enumOptionSchema).max(20).optional(),

  numberPrefix: z.string().regex(/^[A-Z]{1,5}$/).optional(),
  numberingEnabled: z.boolean().default(false),

  defaultAccessLevel: z.enum(['assigned', 'team', 'hub']).default('assigned'),
  piiFields: z.array(z.string()).default([]),

  allowSubRecords: z.boolean().default(false),
  allowFileAttachments: z.boolean().default(true),
  allowInteractionLinks: z.boolean().default(true),
  showInNavigation: z.boolean().default(true),
  showInDashboard: z.boolean().default(false),

  accessRoles: z.array(z.string()).optional(),
  editRoles: z.array(z.string()).optional(),

  templateId: z.string().optional(),
  templateVersion: z.string().optional(),
})

export const updateEntityTypeBodySchema = z.looseObject({
  label: z.string().min(1).max(200).optional(),
  labelPlural: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  fields: z.array(entityFieldDefinitionSchema.omit({ id: true }).extend({
    id: z.string().uuid().optional(),
  })).max(100).optional(),

  statuses: z.array(enumOptionSchema).min(1).max(50).optional(),
  defaultStatus: z.string().optional(),
  closedStatuses: z.array(z.string()).optional(),

  severities: z.array(enumOptionSchema).max(20).optional(),
  defaultSeverity: z.string().optional(),

  categories: z.array(enumOptionSchema).max(50).optional(),
  contactRoles: z.array(enumOptionSchema).max(20).optional(),

  numberPrefix: z.string().regex(/^[A-Z]{1,5}$/).optional(),
  numberingEnabled: z.boolean().optional(),

  defaultAccessLevel: z.enum(['assigned', 'team', 'hub']).optional(),
  piiFields: z.array(z.string()).optional(),

  allowSubRecords: z.boolean().optional(),
  allowFileAttachments: z.boolean().optional(),
  allowInteractionLinks: z.boolean().optional(),
  showInNavigation: z.boolean().optional(),
  showInDashboard: z.boolean().optional(),

  accessRoles: z.array(z.string()).optional(),
  editRoles: z.array(z.string()).optional(),

  isArchived: z.boolean().optional(),
})

export const createRelationshipTypeBodySchema = z.looseObject({
  sourceEntityTypeId: z.string(),
  targetEntityTypeId: z.string(),
  cardinality: z.enum(['1:1', '1:N', 'M:N']),
  label: z.string().min(1).max(200),
  reverseLabel: z.string().min(1).max(200),
  sourceLabel: z.string().min(1).max(200),
  targetLabel: z.string().min(1).max(200),
  roles: z.array(enumOptionSchema).max(20).optional(),
  defaultRole: z.string().optional(),
  joinFields: z.array(entityFieldDefinitionSchema.omit({ id: true }).extend({
    id: z.string().uuid().optional(),
  })).max(20).optional(),
  cascadeDelete: z.boolean().default(false),
  required: z.boolean().default(false),
  templateId: z.string().optional(),
})

export const updateRelationshipTypeBodySchema = z.looseObject({
  label: z.string().min(1).max(200).optional(),
  reverseLabel: z.string().min(1).max(200).optional(),
  sourceLabel: z.string().min(1).max(200).optional(),
  targetLabel: z.string().min(1).max(200).optional(),
  roles: z.array(enumOptionSchema).max(20).optional(),
  defaultRole: z.string().optional(),
  cascadeDelete: z.boolean().optional(),
  required: z.boolean().optional(),
})

export const caseNumberBodySchema = z.looseObject({
  prefix: z.string().regex(/^[A-Z]{1,5}$/),
  year: z.number().int().min(2020).max(2099).optional(),
})

// --- Create roles from template suggestions (Epic 321) ---

export const createRolesFromTemplateBodySchema = z.object({
  roles: z.array(z.object({
    name: z.string().min(1).max(100),
    slug: z.string().regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric with hyphens/underscores'),
    description: z.string().min(1).max(500),
    permissions: z.array(z.string()).min(1),
  })).min(1).max(50),
})
