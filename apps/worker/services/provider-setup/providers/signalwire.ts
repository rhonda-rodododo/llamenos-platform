import type {
  OwnedNumber,
  AvailableNumber,
  NumberSearchQuery,
  NumberProvisionRequest,
} from '@protocol/schemas/provider-setup'
import type { ProviderCapabilityImpl, ConnectionTestResult, WebhookUrls } from '../types'
import { ProviderApiError } from '../types'
import { validateExternalUrl } from '../../../lib/ssrf-guard'

function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

export const signalwireProvider: ProviderCapabilityImpl = {
  providerType: 'signalwire',
  capabilities: ['listNumbers', 'provisionNumbers', 'autoWebhooks'],

  async testConnection(credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const projectId = String(credentials.projectId ?? '')
    const apiToken = String(credentials.apiToken ?? '')
    const spaceUrl = String(credentials.spaceUrl ?? credentials.signalwireSpace ?? '')
    const fullUrl = `https://${spaceUrl}/api/relay/rest/phone_numbers?page_size=1`
    const ssrfError = validateExternalUrl(fullUrl, 'SignalWire space URL')
    if (ssrfError) {
      return { connected: false, latencyMs: 0, error: ssrfError, errorType: 'unknown' }
    }
    const start = Date.now()
    try {
      const res = await fetch(fullUrl, {
        headers: { Authorization: basicAuth(projectId, apiToken) },
      })
      if (!res.ok) {
        const text = await res.text()
        return {
          connected: false,
          latencyMs: Date.now() - start,
          error: `SignalWire API error: ${res.status}`,
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
    const projectId = String(credentials.projectId ?? '')
    const apiToken = String(credentials.apiToken ?? '')
    const spaceUrl = String(credentials.spaceUrl ?? credentials.signalwireSpace ?? '')
    const res = await fetch(`https://${spaceUrl}/api/relay/rest/phone_numbers`, {
      headers: { Authorization: basicAuth(projectId, apiToken) },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to list SignalWire numbers', res.status, text)
    }
    const data = (await res.json()) as {
      data: Array<{
        id: string
        number: string
        name: string
        capabilities: { voice: boolean; sms: boolean; mms: boolean }
      }>
    }
    return data.data.map((n) => ({
      id: n.id,
      phoneNumber: n.number,
      providerType: 'signalwire',
      friendlyName: n.name || n.number,
      capabilities: [
        ...(n.capabilities?.voice ?? true ? ['voice'] : []),
        ...(n.capabilities?.sms ?? true ? ['sms'] : []),
        ...(n.capabilities?.mms ?? false ? ['mms'] : []),
      ],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }))
  },

  async searchAvailableNumbers(
    credentials: Record<string, unknown>,
    query: NumberSearchQuery,
  ): Promise<AvailableNumber[]> {
    const projectId = String(credentials.projectId ?? '')
    const apiToken = String(credentials.apiToken ?? '')
    const spaceUrl = String(credentials.spaceUrl ?? credentials.signalwireSpace ?? '')
    const params = new URLSearchParams({ page_size: String(Math.min(query.limit ?? 20, 50)) })
    if (query.areaCode) params.set('area_code', query.areaCode)

    const res = await fetch(
      `https://${spaceUrl}/api/relay/rest/phone_numbers/available?${params.toString()}`,
      { headers: { Authorization: basicAuth(projectId, apiToken) } },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to search SignalWire numbers', res.status, text)
    }
    const data = (await res.json()) as {
      data: Array<{ number: string; locality?: string; region?: string }>
    }
    return data.data.map((n) => ({
      phoneNumber: n.number,
      providerType: 'signalwire',
      capabilities: ['voice', 'sms'],
      locality: n.locality,
      region: n.region,
    }))
  },

  async provisionNumber(
    credentials: Record<string, unknown>,
    request: NumberProvisionRequest,
  ): Promise<OwnedNumber> {
    const projectId = String(credentials.projectId ?? '')
    const apiToken = String(credentials.apiToken ?? '')
    const spaceUrl = String(credentials.spaceUrl ?? credentials.signalwireSpace ?? '')
    const auth = basicAuth(projectId, apiToken)

    const searchParams = new URLSearchParams({ page_size: '1' })
    if (request.phoneNumber) searchParams.set('contains', request.phoneNumber)

    const searchRes = await fetch(
      `https://${spaceUrl}/api/relay/rest/phone_numbers/available?${searchParams.toString()}`,
      { headers: { Authorization: auth } },
    )
    if (!searchRes.ok) {
      const text = await searchRes.text()
      throw new ProviderApiError('Failed to search SignalWire numbers', searchRes.status, text)
    }
    const searchData = (await searchRes.json()) as {
      data: Array<{ number: string }>
    }
    if (searchData.data.length === 0) {
      throw new ProviderApiError('No available numbers found', 404, 'No numbers available')
    }
    const phoneNumber = searchData.data[0].number

    const buyRes = await fetch(`https://${spaceUrl}/api/relay/rest/phone_numbers`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: phoneNumber }),
    })
    if (!buyRes.ok) {
      const text = await buyRes.text()
      throw new ProviderApiError('Failed to provision SignalWire number', buyRes.status, text)
    }
    const buyData = (await buyRes.json()) as { data: { id: string; number: string } }
    return {
      id: buyData.data.id,
      phoneNumber: buyData.data.number,
      providerType: 'signalwire',
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
    const projectId = String(credentials.projectId ?? '')
    const apiToken = String(credentials.apiToken ?? '')
    const spaceUrl = String(credentials.spaceUrl ?? credentials.signalwireSpace ?? '')
    const body: Record<string, string> = {
      call_handler: 'relay_rest_api',
      call_request_url: urls.voiceIncoming,
      call_status_callback_url: urls.voiceStatus,
    }
    if (urls.sms) {
      body.message_handler = 'relay_rest_api'
      body.message_request_url = urls.sms
    }

    const res = await fetch(`https://${spaceUrl}/api/relay/rest/phone_numbers/${numberId}`, {
      method: 'PUT',
      headers: {
        Authorization: basicAuth(projectId, apiToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to configure SignalWire webhooks', res.status, text)
    }
  },

  async createSipTrunk(): Promise<never> {
    throw new ProviderApiError('SignalWire does not support SIP trunk creation', 400, 'Not supported')
  },
}
