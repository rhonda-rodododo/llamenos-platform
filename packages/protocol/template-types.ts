/**
 * Case Management Template type definitions.
 *
 * Templates are JSON configuration packages that bootstrap a hub's case
 * management schema with entity types, relationship types, suggested roles,
 * and i18n labels for specific use cases (jail support, street medic, etc.).
 */
import { z } from 'zod'

const enumOptionTemplateSchema = z.object({
  value: z.string(),
  label: z.string(),
  color: z.string().optional(),
  icon: z.string().optional(),
  order: z.number(),
  isClosed: z.boolean().optional(),
})

const fieldOptionTemplateSchema = z.object({
  key: z.string(),
  label: z.string(),
})

const showWhenTemplateSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'is_set']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
})

const fieldTemplateSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'select', 'multiselect', 'checkbox', 'textarea', 'date', 'file']),
  required: z.boolean().default(false),
  options: z.array(fieldOptionTemplateSchema).optional(),
  section: z.string().optional(),
  helpText: z.string().optional(),
  order: z.number(),
  indexable: z.boolean().default(false),
  indexType: z.enum(['exact', 'none']).default('none'),
  accessLevel: z.enum(['all', 'admin', 'assigned', 'custom']).default('all'),
  showWhen: showWhenTemplateSchema.optional(),
  hubEditable: z.boolean().default(true),
})

const entityTypeTemplateSchema = z.object({
  name: z.string(),
  label: z.string(),
  labelPlural: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  category: z.enum(['contact', 'case', 'event', 'custom']),
  numberPrefix: z.string().optional(),
  numberingEnabled: z.boolean().default(false),
  defaultAccessLevel: z.enum(['assigned', 'team', 'hub']).default('assigned'),
  piiFields: z.array(z.string()).default([]),
  allowSubRecords: z.boolean().default(false),
  allowFileAttachments: z.boolean().default(true),
  allowInteractionLinks: z.boolean().default(true),
  showInNavigation: z.boolean().default(true),
  showInDashboard: z.boolean().default(false),
  statuses: z.array(enumOptionTemplateSchema),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()),
  severities: z.array(enumOptionTemplateSchema).optional(),
  defaultSeverity: z.string().optional(),
  categories: z.array(enumOptionTemplateSchema).optional(),
  contactRoles: z.array(enumOptionTemplateSchema).optional(),
  fields: z.array(fieldTemplateSchema),
})

const relationshipTypeTemplateSchema = z.object({
  sourceEntityTypeName: z.string(),
  targetEntityTypeName: z.string(),
  cardinality: z.enum(['1:1', '1:N', 'M:N']),
  label: z.string(),
  reverseLabel: z.string(),
  sourceLabel: z.string(),
  targetLabel: z.string(),
  roles: z.array(enumOptionTemplateSchema).optional(),
  defaultRole: z.string().optional(),
  cascadeDelete: z.boolean().default(false),
  required: z.boolean().default(false),
})

const suggestedRoleTemplateSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
})

export const templateManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  license: z.string().optional(),
  tags: z.array(z.string()),

  extends: z.array(z.string()).default([]),

  labels: z.record(
    z.string(),
    z.record(z.string(), z.string()),
  ).default({}),

  entityTypes: z.array(entityTypeTemplateSchema),
  relationshipTypes: z.array(relationshipTypeTemplateSchema).default([]),
  suggestedRoles: z.array(suggestedRoleTemplateSchema).default([]),
})

export type CaseManagementTemplate = z.infer<typeof templateManifestSchema>
