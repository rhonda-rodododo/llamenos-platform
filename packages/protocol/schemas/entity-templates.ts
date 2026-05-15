import { z } from 'zod'

/**
 * Shipped entity type templates. Hub admins enable these as starting points
 * and customize fields/statuses. Templates are defined here as the single
 * source of truth; the server seeds them into entity_type_templates on startup.
 */

export const entityTemplateCategorySchema = z.enum([
  'case', 'event', 'incident_report', 'contact_note',
])
export type EntityTemplateCategory = z.infer<typeof entityTemplateCategorySchema>

export const entityTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  labelPlural: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  category: entityTemplateCategorySchema,
  version: z.string(),
  fields: z.array(z.object({
    id: z.string(),
    name: z.string(),
    label: z.string(),
    type: z.enum([
      'text', 'number', 'select', 'multiselect', 'checkbox',
      'textarea', 'date', 'file', 'location',
    ]),
    required: z.boolean().optional().default(false),
    indexable: z.boolean().optional().default(false),
    indexType: z.enum(['exact', 'date', 'location', 'none']).optional().default('none'),
    locationOptions: z.object({
      maxPrecision: z.enum(['none', 'city', 'neighborhood', 'block', 'exact']).optional().default('neighborhood'),
      allowGps: z.boolean().optional().default(true),
      allowAutocomplete: z.boolean().optional().default(true),
    }).optional(),
    order: z.number().int().optional().default(0),
  })),
  statuses: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    isDefault: z.boolean().optional(),
    isClosed: z.boolean().optional(),
  })),
  defaultStatus: z.string(),
  closedStatuses: z.array(z.string()).optional().default([]),
  severities: z.array(z.object({
    value: z.string(),
    label: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).optional(),
  allowSubRecords: z.boolean().optional().default(false),
  allowFileAttachments: z.boolean().optional().default(true),
  allowInteractionLinks: z.boolean().optional().default(true),
  numberingEnabled: z.boolean().optional().default(false),
  numberPrefix: z.string().regex(/^[A-Z]{1,5}$/).optional(),
  tags: z.array(z.string()).optional().default([]),
  isBuiltin: z.boolean().optional().default(true),
})

export type EntityTemplate = z.infer<typeof entityTemplateSchema>

export const entityTemplateListResponseSchema = z.object({
  templates: z.array(entityTemplateSchema),
  appliedTemplateIds: z.array(z.string()),
})

export type EntityTemplateListResponse = z.infer<typeof entityTemplateListResponseSchema>

export const applyEntityTemplateBodySchema = z.object({
  templateId: z.string(),
})

export type ApplyEntityTemplateBody = z.infer<typeof applyEntityTemplateBodySchema>

export const applyEntityTemplateResponseSchema = z.object({
  applied: z.boolean(),
  entityTypeId: z.string(),
})

export type ApplyEntityTemplateResponse = z.infer<typeof applyEntityTemplateResponseSchema>
