import { request } from '../api'
import type {
  HubOnboardingState,
  HubSetupStatus,
  HubUsage,
  HubQuota,
  ChannelConfig,
  ProviderTemplate,
} from '@protocol/schemas/provider-setup'

export async function startOnboarding(
  hubId: string,
  templateId?: string,
): Promise<{ onboarding: HubOnboardingState }> {
  return request<{ onboarding: HubOnboardingState }>(`/hubs/${encodeURIComponent(hubId)}/onboard`, {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  })
}

export async function getOnboardingStatus(
  hubId: string,
): Promise<{ onboarding: HubOnboardingState | null }> {
  return request<{ onboarding: HubOnboardingState | null }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/status`,
  )
}

export async function completeOnboardingStep(
  hubId: string,
  step: string,
  data?: { channelConfig?: ChannelConfig },
): Promise<{ onboarding: HubOnboardingState }> {
  return request<{ onboarding: HubOnboardingState }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/step`,
    {
      method: 'PUT',
      body: JSON.stringify({ step, data }),
    },
  )
}

export async function getProviderStatus(hubId: string): Promise<{ status: HubSetupStatus }> {
  return request<{ status: HubSetupStatus }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/provider-status`,
  )
}

export async function getHubUsage(hubId: string): Promise<{ usage: HubUsage }> {
  return request<{ usage: HubUsage }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/usage`,
  )
}

export async function setHubQuotas(
  hubId: string,
  quotas: HubQuota,
): Promise<{ quotas: HubQuota }> {
  return request<{ quotas: HubQuota }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/quotas`,
    {
      method: 'PUT',
      body: JSON.stringify(quotas),
    },
  )
}

export async function updateChannel(
  hubId: string,
  channel: string,
  enabled: boolean,
): Promise<{ channels: ChannelConfig }> {
  return request<{ channels: ChannelConfig }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/channels`,
    {
      method: 'PUT',
      body: JSON.stringify({ channel, enabled }),
    },
  )
}

export async function provisionSubAccount(
  hubId: string,
  masterConfigId: string,
): Promise<{ subAccountId: string }> {
  return request<{ subAccountId: string }>(
    `/hubs/${encodeURIComponent(hubId)}/onboard/sub-account`,
    {
      method: 'POST',
      body: JSON.stringify({ masterConfigId }),
    },
  )
}

export async function listProviderTemplates(): Promise<{
  templates: ProviderTemplate[]
}> {
  return request<{ templates: ProviderTemplate[] }>('/provider-templates')
}

export async function getProviderTemplate(id: string): Promise<{
  template: ProviderTemplate
}> {
  return request<{ template: ProviderTemplate }>(`/provider-templates/${encodeURIComponent(id)}`)
}
