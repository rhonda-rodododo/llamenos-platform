import { describe, it, expect } from 'vitest'
import { applyTemplate, detectTemplateUpdates } from '@worker/lib/template-engine'
import type { CaseManagementTemplate } from '../../../../packages/protocol/template-types'
import type { ReportTypeDefinition } from '@protocol/schemas/report-types'

const minStatus = { value: 'open', label: 'Open', order: 0 }
const minField = {
  name: 'title',
  label: 'field.title',
  type: 'text' as const,
  required: false,
  order: 0,
  indexable: false,
  indexType: 'none' as const,
  accessLevel: 'all' as const,
  hubEditable: true,
  supportAudioInput: false,
}

type TemplateEntityType = CaseManagementTemplate['entityTypes'][number]

function makeEntityType(overrides: Partial<TemplateEntityType> & { name: string }): TemplateEntityType {
  return {
    label: overrides.name,
    labelPlural: overrides.name + 's',
    description: overrides.name,
    category: 'case',
    numberingEnabled: false,
    defaultAccessLevel: 'assigned',
    piiFields: [],
    allowSubRecords: false,
    allowFileAttachments: true,
    allowInteractionLinks: true,
    showInNavigation: true,
    showInDashboard: false,
    statuses: [minStatus],
    defaultStatus: 'open',
    closedStatuses: [],
    fields: [minField],
    ...overrides,
  }
}

function makeTemplate(overrides: Partial<CaseManagementTemplate> & { id: string }): CaseManagementTemplate {
  return {
    version: '1.0.0',
    name: 'Test Template',
    description: 'A test template',
    author: 'test',
    tags: [],
    extends: [],
    labels: { en: {} },
    defaultChannels: [],
    providerDefaults: { a2pRequired: false, webrtcEnabled: false, sipTrunkEnabled: false },
    allowSubAccounts: false,
    channelGuidance: [],
    entityTypes: [],
    relationshipTypes: [],
    reportTypes: [],
    suggestedRoles: [],
    ...overrides,
  }
}

type TemplateReportType = CaseManagementTemplate['reportTypes'][number]

function makeReportType(overrides: Partial<TemplateReportType> & { name: string }): TemplateReportType {
  return {
    label: overrides.name,
    labelPlural: overrides.name + 's',
    description: overrides.name,
    icon: 'clipboard',
    color: 'blue',
    statuses: [minStatus],
    defaultStatus: 'open',
    closedStatuses: [],
    allowFileAttachments: true,
    allowCaseConversion: false,
    mobileOptimized: false,
    numberingEnabled: false,
    fields: [minField],
    ...overrides,
  }
}

const hubId = 'hub-test'

describe('applyTemplate — report types', () => {
  it('creates report types from template', () => {
    const tpl = makeTemplate({
      id: 'tpl-rt',
      labels: { en: { 'rt.label': 'Incident Report', 'rt.plural': 'Incident Reports' } },
      reportTypes: [makeReportType({
        name: 'incident_report',
        label: 'rt.label',
        labelPlural: 'rt.plural',
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])

    expect(result.reportTypes).toHaveLength(1)
    expect(result.reportTypes[0].name).toBe('incident_report')
    expect(result.reportTypes[0].label).toBe('Incident Report')
    expect(result.reportTypes[0].labelPlural).toBe('Incident Reports')
    expect(result.reportTypes[0].hubId).toBe(hubId)
    expect(result.reportTypes[0].templateId).toBe('tpl-rt')
    expect(result.reportTypes[0].templateVersion).toBe('1.0.0')
    expect(result.reportTypes[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('preserves existing report type IDs (idempotent)', () => {
    const existingId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const tpl = makeTemplate({
      id: 'tpl-rt-idem',
      labels: { en: {} },
      reportTypes: [makeReportType({ name: 'field_report' })],
    })

    const existingReportTypes: ReportTypeDefinition[] = [{
      id: existingId,
      hubId,
      name: 'field_report',
      label: 'Field Report',
      labelPlural: 'Field Reports',
      description: '',
      icon: 'clipboard',
      color: 'blue',
      category: 'report',
      templateId: 'tpl-rt-idem',
      templateVersion: '0.9.0',
      fields: [],
      statuses: [minStatus],
      defaultStatus: 'open',
      closedStatuses: [],
      numberingEnabled: false,
      allowFileAttachments: true,
      allowCaseConversion: false,
      mobileOptimized: false,
      isArchived: false,
      isSystem: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }]

    const result = applyTemplate(tpl, hubId, new Map(), [], existingReportTypes)
    expect(result.reportTypes[0].id).toBe(existingId)
    // createdAt should be preserved from existing
    expect(result.reportTypes[0].createdAt).toBe('2026-01-01T00:00:00Z')
  })

  it('child template overrides parent report types with same name', () => {
    const parent = makeTemplate({
      id: 'parent',
      labels: { en: {} },
      reportTypes: [makeReportType({ name: 'shared_report', label: 'Parent Label' })],
    })

    const child = makeTemplate({
      id: 'child',
      extends: ['parent'],
      labels: { en: { 'child.label': 'Child Label' } },
      reportTypes: [makeReportType({ name: 'shared_report', label: 'child.label' })],
    })

    const allTemplates = new Map([['parent', parent]])
    const result = applyTemplate(child, hubId, allTemplates, [])

    expect(result.reportTypes).toHaveLength(1)
    expect(result.reportTypes[0].label).toBe('Child Label')
  })

  it('inherits parent report types that are not overridden', () => {
    const parent = makeTemplate({
      id: 'parent',
      labels: { en: {} },
      reportTypes: [makeReportType({ name: 'parent_only_report' })],
    })

    const child = makeTemplate({
      id: 'child',
      extends: ['parent'],
      labels: { en: {} },
      reportTypes: [makeReportType({ name: 'child_only_report' })],
    })

    const allTemplates = new Map([['parent', parent]])
    const result = applyTemplate(child, hubId, allTemplates, [])

    const names = result.reportTypes.map(r => r.name)
    expect(names).toContain('parent_only_report')
    expect(names).toContain('child_only_report')
  })

  it('report type fields get UUIDs and correct defaults', () => {
    const tpl = makeTemplate({
      id: 'tpl-rtf',
      labels: { en: { 'sec.info': 'Information' } },
      reportTypes: [makeReportType({
        name: 'detailed_report',
        fields: [
          {
            name: 'description',
            label: 'Description',
            type: 'textarea' as const,
            required: true,
            order: 0,
            indexable: true,
            indexType: 'exact' as const,
            accessLevel: 'admin' as const,
            hubEditable: false,
            supportAudioInput: true,
            section: 'sec.info',
            helpText: 'Enter details',
          },
          {
            name: 'category',
            label: 'Category',
            type: 'select' as const,
            required: false,
            order: 1,
            indexable: false,
            indexType: 'none' as const,
            accessLevel: 'all' as const,
            hubEditable: true,
            supportAudioInput: false,
            options: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }, { key: 'C', label: 'C' }],
          },
        ],
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const fields = result.reportTypes[0].fields

    expect(fields).toHaveLength(2)
    expect(fields[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(fields[0].name).toBe('description')
    expect(fields[0].required).toBe(true)
    expect(fields[0].indexable).toBe(true)
    expect(fields[0].accessLevel).toBe('admin')
    expect(fields[0].hubEditable).toBe(false)
    expect(fields[0].supportAudioInput).toBe(true)
    expect(fields[0].section).toBe('Information') // label resolved
    expect(fields[0].templateId).toBe('tpl-rtf')

    expect(fields[1].name).toBe('category')
    expect(fields[1].options).toEqual([{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }, { key: 'C', label: 'C' }])
  })

  it('report type flags are correctly set', () => {
    const tpl = makeTemplate({
      id: 'tpl-flags',
      labels: { en: {} },
      reportTypes: [makeReportType({
        name: 'mobile_report',
        allowCaseConversion: true,
        mobileOptimized: true,
        allowFileAttachments: false,
        numberPrefix: 'MR',
        numberingEnabled: true,
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const rt = result.reportTypes[0]

    expect(rt.allowCaseConversion).toBe(true)
    expect(rt.mobileOptimized).toBe(true)
    expect(rt.allowFileAttachments).toBe(false)
    expect(rt.numberPrefix).toBe('MR')
    expect(rt.numberingEnabled).toBe(true)
    expect(rt.category).toBe('report')
    expect(rt.isArchived).toBe(false)
    expect(rt.isSystem).toBe(false)
  })

  it('report type IDs are tracked in appliedRecord', () => {
    const tpl = makeTemplate({
      id: 'tpl-track',
      labels: { en: {} },
      reportTypes: [
        makeReportType({ name: 'report_a' }),
        makeReportType({ name: 'report_b' }),
      ],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    expect(result.appliedRecord.reportTypeIds).toHaveLength(2)
    expect(result.appliedRecord.reportTypeIds).toEqual(
      result.reportTypes.map(r => r.id)
    )
  })

  it('handles template with no report types', () => {
    const tpl = makeTemplate({
      id: 'tpl-no-rt',
      labels: { en: {} },
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    expect(result.reportTypes).toHaveLength(0)
    expect(result.appliedRecord.reportTypeIds).toHaveLength(0)
  })
})

describe('applyTemplate — label resolution edge cases', () => {
  it('falls back to raw key when label is not in labels map', () => {
    const tpl = makeTemplate({
      id: 'tpl-nolabel',
      labels: { en: {} }, // empty labels
      entityTypes: [makeEntityType({
        name: 'test',
        label: 'missing.label.key',
        labelPlural: 'missing.plural.key',
        description: 'missing.desc.key',
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    expect(result.entityTypes[0].label).toBe('missing.label.key')
    expect(result.entityTypes[0].labelPlural).toBe('missing.plural.key')
    expect(result.entityTypes[0].description).toBe('missing.desc.key')
  })

  it('resolves field section and helpText labels', () => {
    const tpl = makeTemplate({
      id: 'tpl-fieldlabels',
      labels: { en: { 'sec.details': 'Details Section', 'help.name': 'Enter the full name' } },
      entityTypes: [makeEntityType({
        name: 'labeled',
        fields: [{
          ...minField,
          section: 'sec.details',
          helpText: 'help.name',
        }],
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const field = result.entityTypes[0].fields[0]
    expect(field.section).toBe('Details Section')
    expect(field.helpText).toBe('Enter the full name')
  })

  it('leaves field section undefined when not provided', () => {
    const tpl = makeTemplate({
      id: 'tpl-nosec',
      labels: { en: {} },
      entityTypes: [makeEntityType({
        name: 'nosec',
        fields: [{
          ...minField,
          section: undefined,
          helpText: undefined,
        }],
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const field = result.entityTypes[0].fields[0]
    expect(field.section).toBeUndefined()
    expect(field.helpText).toBeUndefined()
  })
})

describe('applyTemplate — relationship with contact sentinel', () => {
  it('resolves contact as built-in entity type name', () => {
    const tpl = makeTemplate({
      id: 'tpl-contact-rel',
      labels: { en: {} },
      entityTypes: [makeEntityType({ name: 'incident' })],
      relationshipTypes: [{
        sourceEntityTypeName: 'incident',
        targetEntityTypeName: 'contact', // built-in sentinel
        cardinality: 'M:N',
        label: 'involves',
        reverseLabel: 'involved in',
        sourceLabel: 'Incident',
        targetLabel: 'Contact',
        cascadeDelete: false,
        required: false,
      }],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    expect(result.relationshipTypes).toHaveLength(1)
    expect(result.relationshipTypes[0].targetEntityTypeId).toBe('contact')
  })
})

describe('applyTemplate — field ordering', () => {
  it('uses explicit field order when provided', () => {
    const tpl = makeTemplate({
      id: 'tpl-order',
      labels: { en: {} },
      entityTypes: [makeEntityType({
        name: 'ordered',
        fields: [
          { ...minField, name: 'first', order: 10 },
          { ...minField, name: 'second', order: 5 },
        ],
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const fields = result.entityTypes[0].fields
    expect(fields[0].order).toBe(10)
    expect(fields[1].order).toBe(5)
  })

  it('falls back to array index when order is undefined', () => {
    const tpl = makeTemplate({
      id: 'tpl-autoorder',
      labels: { en: {} },
      entityTypes: [makeEntityType({
        name: 'autoorder',
        fields: [
          { ...minField, name: 'a', order: undefined as unknown as number },
          { ...minField, name: 'b', order: undefined as unknown as number },
          { ...minField, name: 'c', order: undefined as unknown as number },
        ],
      })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const fields = result.entityTypes[0].fields
    expect(fields[0].order).toBe(0)
    expect(fields[1].order).toBe(1)
    expect(fields[2].order).toBe(2)
  })
})

describe('detectTemplateUpdates — edge cases', () => {
  it('ignores applied templates not in available list', () => {
    const applied = [
      { templateId: 'removed-tpl', templateVersion: '1.0.0', appliedAt: '', entityTypeIds: [], relationshipTypeIds: [], reportTypeIds: [] },
    ]
    const updates = detectTemplateUpdates(applied, [])
    expect(updates).toHaveLength(0)
  })

  it('handles multiple templates with mixed states', () => {
    const applied = [
      { templateId: 'tpl-a', templateVersion: '1.0.0', appliedAt: '', entityTypeIds: [], relationshipTypeIds: [], reportTypeIds: [] },
      { templateId: 'tpl-b', templateVersion: '2.0.0', appliedAt: '', entityTypeIds: [], relationshipTypeIds: [], reportTypeIds: [] },
      { templateId: 'tpl-c', templateVersion: '1.0.0', appliedAt: '', entityTypeIds: [], relationshipTypeIds: [], reportTypeIds: [] },
    ]
    const available = [
      makeTemplate({ id: 'tpl-a', version: '1.0.0' }), // same
      makeTemplate({ id: 'tpl-b', version: '3.0.0' }), // updated
      // tpl-c not available
    ]

    const updates = detectTemplateUpdates(applied, available)
    expect(updates).toHaveLength(1)
    expect(updates[0].templateId).toBe('tpl-b')
    expect(updates[0].installedVersion).toBe('2.0.0')
    expect(updates[0].availableVersion).toBe('3.0.0')
  })
})
