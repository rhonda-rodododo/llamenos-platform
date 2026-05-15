import type { EntityTemplate } from '@protocol/schemas/entity-templates'

/**
 * EntityTemplatesService — manages builtin and hub-applied entity type templates.
 * Builtin templates are defined in code here; they are the source of truth
 * shipped with the application. Hub admins apply templates to create
 * hub-specific entity type instances via the entity-schema routes.
 */
export class EntityTemplatesService {
  // =========================================================================
  // Builtin Templates
  // =========================================================================

  listBuiltinTemplates(): EntityTemplate[] {
    return BUILTIN_TEMPLATES
  }

  getBuiltinTemplate(id: string): EntityTemplate | undefined {
    return BUILTIN_TEMPLATES.find(t => t.id === id)
  }
}

// =========================================================================
// Template Definitions
// =========================================================================

const BUILTIN_TEMPLATES: EntityTemplate[] = [
  {
    id: 'builtin:case',
    name: 'case',
    label: 'Case',
    labelPlural: 'Cases',
    description: 'A general-purpose case for tracking incidents, calls, and follow-up.',
    icon: 'folder',
    color: '#3b82f6',
    category: 'case',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['default'],
    fields: [
      {
        id: 'builtin:case:title',
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:case:description',
        name: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        indexable: false,
        indexType: 'none',
        order: 1,
      },
    ],
    statuses: [
      { value: 'open', label: 'Open', color: '#3b82f6', isDefault: true },
      { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
      { value: 'resolved', label: 'Resolved', color: '#10b981', isClosed: true },
      { value: 'closed', label: 'Closed', color: '#6b7280', isClosed: true },
    ],
    defaultStatus: 'open',
    closedStatuses: ['resolved', 'closed'],
    severities: [
      { value: 'critical', label: 'Critical', color: '#ef4444' },
      { value: 'high', label: 'High', color: '#f97316' },
      { value: 'medium', label: 'Medium', color: '#f59e0b' },
      { value: 'low', label: 'Low', color: '#6b7280' },
    ],
    allowSubRecords: true,
    allowFileAttachments: true,
    allowInteractionLinks: true,
    numberingEnabled: true,
    numberPrefix: 'CASE',
  },
  {
    id: 'builtin:event',
    name: 'event',
    label: 'Event',
    labelPlural: 'Events',
    description: 'A time-bounded event (protest, mass arrest, community action). Dates and location are encrypted.',
    icon: 'calendar',
    color: '#8b5cf6',
    category: 'event',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['temporal'],
    fields: [
      {
        id: 'builtin:event:title',
        name: 'title',
        label: 'Event Name',
        type: 'text',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:event:start_date',
        name: 'start_date',
        label: 'Start Date',
        type: 'date',
        required: true,
        indexable: true,
        indexType: 'date',
        order: 1,
      },
      {
        id: 'builtin:event:end_date',
        name: 'end_date',
        label: 'End Date',
        type: 'date',
        required: false,
        indexable: true,
        indexType: 'date',
        order: 2,
      },
      {
        id: 'builtin:event:location',
        name: 'location',
        label: 'Location',
        type: 'location',
        required: false,
        indexable: true,
        indexType: 'location',
        locationOptions: {
          maxPrecision: 'neighborhood',
          allowGps: true,
          allowAutocomplete: true,
        },
        order: 3,
      },
      {
        id: 'builtin:event:description',
        name: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
        indexable: false,
        indexType: 'none',
        order: 4,
      },
    ],
    statuses: [
      { value: 'planned', label: 'Planned', color: '#3b82f6', isDefault: true },
      { value: 'active', label: 'Active', color: '#10b981' },
      { value: 'concluded', label: 'Concluded', color: '#6b7280', isClosed: true },
      { value: 'cancelled', label: 'Cancelled', color: '#ef4444', isClosed: true },
    ],
    defaultStatus: 'planned',
    closedStatuses: ['concluded', 'cancelled'],
    allowSubRecords: true,
    allowFileAttachments: true,
    allowInteractionLinks: false,
    numberingEnabled: false,
  },
  {
    id: 'builtin:incident_report',
    name: 'incident_report',
    label: 'Incident Report',
    labelPlural: 'Incident Reports',
    description: 'Triage-oriented incident documentation. Severity, category, and auto-conversion from triage reports.',
    icon: 'alert-triangle',
    color: '#ef4444',
    category: 'incident_report',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['triage'],
    fields: [
      {
        id: 'builtin:incident:title',
        name: 'title',
        label: 'Incident Title',
        type: 'text',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:incident:incident_date',
        name: 'incident_date',
        label: 'Incident Date/Time',
        type: 'date',
        required: true,
        indexable: true,
        indexType: 'date',
        order: 1,
      },
      {
        id: 'builtin:incident:location',
        name: 'location',
        label: 'Incident Location',
        type: 'location',
        required: false,
        indexable: true,
        indexType: 'location',
        locationOptions: {
          maxPrecision: 'neighborhood',
          allowGps: false,
          allowAutocomplete: true,
        },
        order: 2,
      },
      {
        id: 'builtin:incident:description',
        name: 'description',
        label: 'What Happened',
        type: 'textarea',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 3,
      },
    ],
    statuses: [
      { value: 'new', label: 'New', color: '#ef4444', isDefault: true },
      { value: 'under_review', label: 'Under Review', color: '#f59e0b' },
      { value: 'documented', label: 'Documented', color: '#3b82f6' },
      { value: 'closed', label: 'Closed', color: '#6b7280', isClosed: true },
    ],
    defaultStatus: 'new',
    closedStatuses: ['closed'],
    severities: [
      { value: 'critical', label: 'Critical', color: '#ef4444' },
      { value: 'high', label: 'High', color: '#f97316' },
      { value: 'medium', label: 'Medium', color: '#f59e0b' },
      { value: 'low', label: 'Low', color: '#6b7280' },
    ],
    allowSubRecords: false,
    allowFileAttachments: true,
    allowInteractionLinks: true,
    numberingEnabled: true,
    numberPrefix: 'INC',
  },
  {
    id: 'builtin:contact_note',
    name: 'contact_note',
    label: 'Contact Note',
    labelPlural: 'Contact Notes',
    description: 'A minimal note linked to a contact. No assignment. Used for documenting contact history.',
    icon: 'file-text',
    color: '#6b7280',
    category: 'case',
    version: '1.0.0',
    isBuiltin: true,
    tags: ['contacts'],
    fields: [
      {
        id: 'builtin:contact_note:note',
        name: 'note',
        label: 'Note',
        type: 'textarea',
        required: true,
        indexable: false,
        indexType: 'none',
        order: 0,
      },
      {
        id: 'builtin:contact_note:date',
        name: 'date',
        label: 'Date',
        type: 'date',
        required: false,
        indexable: true,
        indexType: 'date',
        order: 1,
      },
    ],
    statuses: [
      { value: 'active', label: 'Active', color: '#3b82f6', isDefault: true },
      { value: 'archived', label: 'Archived', color: '#6b7280', isClosed: true },
    ],
    defaultStatus: 'active',
    closedStatuses: ['archived'],
    allowSubRecords: false,
    allowFileAttachments: false,
    allowInteractionLinks: false,
    numberingEnabled: false,
  },
]
