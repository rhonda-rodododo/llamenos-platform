import { request } from './client'

// --- A2P Registration ---

export interface A2pRegistration {
  id: string
  hubId: string
  providerType: string
  brandStatus: 'not_submitted' | 'pending' | 'approved' | 'failed' | 'skipped'
  campaignStatus: 'not_submitted' | 'pending' | 'approved' | 'failed' | 'skipped'
  brandSidMasked: string | null
  campaignSidMasked: string | null
  error: string | null
  submittedAt: string | null
  approvedAt: string | null
}

export interface BrandInfo {
  entityType: string
  companyName: string
  ein: string
  phone: string
  street: string
  city: string
  state: string
  postalCode: string
  country: string
  email: string
  website?: string
  vertical?: string
}

export interface CampaignInfo {
  useCase: string
  description: string
  helpMessage: string
  optinMessage: string
  optoutMessage: string
  sampleMessages: string[]
  embeddedLink?: boolean
  embeddedPhone?: boolean
  subscriberOptin?: boolean
  subscriberOptout?: boolean
  subscriberHelp?: boolean
}

export async function getA2pStatus(hubId: string): Promise<A2pRegistration | null> {
  try {
    return await request<A2pRegistration>(`/provider-setup/a2p/status?hubId=${hubId}`)
  } catch {
    return null
  }
}

export async function submitA2pBrand(hubId: string, brandInfo: BrandInfo): Promise<A2pRegistration> {
  return request<A2pRegistration>('/provider-setup/a2p/brand', {
    method: 'POST',
    body: JSON.stringify({ hubId, brandInfo }),
  })
}

export async function submitA2pCampaign(registrationId: string, hubId: string, campaignInfo: CampaignInfo): Promise<A2pRegistration> {
  return request<A2pRegistration>('/provider-setup/a2p/campaign', {
    method: 'POST',
    body: JSON.stringify({ registrationId, hubId, campaignInfo }),
  })
}

export async function skipA2p(hubId: string): Promise<A2pRegistration> {
  return request<A2pRegistration>('/provider-setup/a2p/skip', {
    method: 'POST',
    body: JSON.stringify({ hubId }),
  })
}
