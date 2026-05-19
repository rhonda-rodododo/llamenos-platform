import type {
  OwnedNumber,
  AvailableNumber,
  NumberSearchQuery,
  NumberProvisionRequest,
} from '@protocol/schemas/provider-setup'
import type { ProviderCapabilityImpl, ConnectionTestResult, WebhookUrls } from '../types'
import { ProviderApiError } from '../types'
import { basicAuth, nowISO } from '../utils'
import { safeFetch } from '../../../lib/safe-fetch'

/** Escape special characters for safe XML interpolation. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const bandwidthProvider: ProviderCapabilityImpl = {
  providerType: 'bandwidth',
  capabilities: ['listNumbers', 'provisionNumbers', 'autoWebhooks'],

  async testConnection(credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const accountId = String(credentials.accountId ?? credentials.authId ?? '')
    const username = String(credentials.username ?? '')
    const password = String(credentials.password ?? credentials.authToken ?? '')
    const start = Date.now()
    try {
      const res = await safeFetch(`https://dashboard.bandwidth.com/api/accounts/${accountId}`, {
        headers: { Authorization: basicAuth(username, password) },
      })
      if (!res.ok) {
        await res.text()
        return {
          connected: false,
          latencyMs: Date.now() - start,
          error: `Bandwidth API error: ${res.status}`,
          errorType: res.status === 401 ? 'invalid_credentials' : 'unknown',
        } as ConnectionTestResult
      }
      return { connected: true, latencyMs: Date.now() - start }
    } catch (err) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Network error',
        errorType: 'network_error',
      }
    }
  },

  async listOwnedNumbers(credentials: Record<string, unknown>): Promise<OwnedNumber[]> {
    const accountId = String(credentials.accountId ?? credentials.authId ?? '')
    const username = String(credentials.username ?? '')
    const password = String(credentials.password ?? credentials.authToken ?? '')
    const res = await safeFetch(
      `https://dashboard.bandwidth.com/api/accounts/${accountId}/phonenumbers?page=1&size=100`,
      { headers: { Authorization: basicAuth(username, password) } },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to list Bandwidth numbers', res.status, text)
    }
    const data = (await res.json()) as {
      telephoneNumbers?: Array<{
        telephoneNumber: string
        features: string[]
        city?: string
        state?: string
      }>
    }
    return (data.telephoneNumbers || []).map((n) => ({
      id: n.telephoneNumber,
      phoneNumber: n.telephoneNumber,
      providerType: 'bandwidth',
      friendlyName: `${n.telephoneNumber} (${n.city || ''}, ${n.state || ''})`,
      capabilities: [
        ...(n.features?.includes('Voice') ?? true ? ['voice'] : []),
        ...(n.features?.includes('Sms') ?? true ? ['sms'] : []),
        ...(n.features?.includes('Mms') ?? false ? ['mms'] : []),
      ],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }))
  },

  async searchAvailableNumbers(
    credentials: Record<string, unknown>,
    query: NumberSearchQuery,
  ): Promise<AvailableNumber[]> {
    const accountId = String(credentials.accountId ?? credentials.authId ?? '')
    const username = String(credentials.username ?? '')
    const password = String(credentials.password ?? credentials.authToken ?? '')
    const params = new URLSearchParams({
      page: '1',
      size: String(Math.min(query.limit ?? 20, 50)),
    })
    if (query.areaCode) params.set('areaCode', query.areaCode)

    const res = await safeFetch(
      `https://dashboard.bandwidth.com/api/accounts/${accountId}/availableNumbers?${params.toString()}`,
      { headers: { Authorization: basicAuth(username, password) } },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to search Bandwidth numbers', res.status, text)
    }
    const data = (await res.json()) as {
      telephoneNumbers?: Array<{
        telephoneNumber: string
        city?: string
        state?: string
        rateCenter?: string
      }>
    }
    return (data.telephoneNumbers || []).map((n) => ({
      phoneNumber: n.telephoneNumber,
      providerType: 'bandwidth',
      capabilities: ['voice', 'sms'],
      locality: n.city,
      region: n.state,
    }))
  },

  async provisionNumber(
    credentials: Record<string, unknown>,
    request: NumberProvisionRequest,
  ): Promise<OwnedNumber> {
    const accountId = String(credentials.accountId ?? credentials.authId ?? '')
    const username = String(credentials.username ?? '')
    const password = String(credentials.password ?? credentials.authToken ?? '')
    const auth = basicAuth(username, password)

    if (!request.phoneNumber) {
      throw new ProviderApiError('Bandwidth provision requires a specific phoneNumber', 400, 'Missing phoneNumber')
    }

    const res = await safeFetch(
      `https://dashboard.bandwidth.com/api/accounts/${accountId}/orders`,
      {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/xml',
        },
        body: `<Order>
          <Name>Llamenos Number Order</Name>
          <SiteId>${escapeXml(accountId)}</SiteId>
          <ExistingTelephoneNumberOrderType>
            <TelephoneNumberList>
              <TelephoneNumber>${escapeXml(request.phoneNumber)}</TelephoneNumber>
            </TelephoneNumberList>
          </ExistingTelephoneNumberOrderType>
        </Order>`,
      },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to provision Bandwidth number', res.status, text)
    }

    return {
      id: request.phoneNumber,
      phoneNumber: request.phoneNumber,
      providerType: 'bandwidth',
      capabilities: ['voice', 'sms'],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }
  },

  async configureWebhooks(
    credentials: Record<string, unknown>,
    numberId: string,
    urls: WebhookUrls,
  ): Promise<void> {
    const accountId = String(credentials.accountId ?? credentials.authId ?? '')
    const username = String(credentials.username ?? '')
    const password = String(credentials.password ?? credentials.authToken ?? '')
    const applicationId = String(credentials.applicationId ?? credentials.bandwidthAppId ?? '')

    if (!applicationId) {
      throw new ProviderApiError('Bandwidth applicationId is required for webhook configuration', 400, 'Missing applicationId')
    }

    const res = await safeFetch(
      `https://dashboard.bandwidth.com/api/accounts/${accountId}/applications/${applicationId}`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth(username, password),
          'Content-Type': 'application/xml',
        },
        body: `<Application>
          <ServiceType>Voice-V2</ServiceType>
          <AppName>${escapeXml(`Llamenos - ${urls.voiceIncoming}`)}</AppName>
          <CallInitiatedCallbackUrl>${escapeXml(urls.voiceIncoming)}</CallInitiatedCallbackUrl>
          <CallStatusCallbackUrl>${escapeXml(urls.voiceStatus)}</CallStatusCallbackUrl>
          ${urls.sms ? `<MessageCallbackUrl>${escapeXml(urls.sms)}</MessageCallbackUrl>` : ''}
        </Application>`,
      },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to configure Bandwidth webhooks', res.status, text)
    }
  },

  async createSipTrunk(): Promise<never> {
    throw new ProviderApiError('Bandwidth does not support SIP trunk creation', 400, 'Not supported')
  },
}
