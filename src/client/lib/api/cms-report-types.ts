import { request, hp } from './client'
import type { ReportTypeDefinition } from '@protocol/schemas/report-types'
import type { EntityFieldDefinition, EnumOption } from '@shared/types'

export type { ReportTypeDefinition }

// --- CMS Report Type Definitions (Epic 343) ---

export async function listCmsReportTypes() {
  return request<{ reportTypes: ReportTypeDefinition[] }>(hp('/settings/cms/report-types'))
}

export async function getCmsReportType(id: string) {
  return request<ReportTypeDefinition>(hp(`/settings/cms/report-types/${id}`))
}

export async function createCmsReportType(body: {
  name: string
  label: string
  labelPlural: string
  description?: string
  icon?: string
  color?: string
  fields?: Array<Partial<EntityFieldDefinition> & { supportAudioInput?: boolean }>
  statuses: EnumOption[]
  defaultStatus: string
  closedStatuses?: string[]
  numberPrefix?: string
  numberingEnabled?: boolean
  allowFileAttachments?: boolean
  allowCaseConversion?: boolean
  mobileOptimized?: boolean
}) {
  return request<ReportTypeDefinition>(hp('/settings/cms/report-types'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateCmsReportType(id: string, body: Partial<{
  label: string
  labelPlural: string
  description: string
  icon: string
  color: string
  fields: Array<Partial<EntityFieldDefinition> & { supportAudioInput?: boolean }>
  statuses: EnumOption[]
  defaultStatus: string
  closedStatuses: string[]
  numberPrefix: string
  numberingEnabled: boolean
  allowFileAttachments: boolean
  allowCaseConversion: boolean
  mobileOptimized: boolean
  isArchived: boolean
}>) {
  return request<ReportTypeDefinition>(hp(`/settings/cms/report-types/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteCmsReportType(id: string) {
  return request<{ archived: boolean; id: string }>(hp(`/settings/cms/report-types/${id}`), {
    method: 'DELETE',
  })
}
