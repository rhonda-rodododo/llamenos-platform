import type {
  OwnedNumber,
  AvailableNumber,
  NumberSearchQuery,
  NumberProvisionRequest,
} from '@protocol/schemas/provider-setup'
import type { ProviderCapabilityImpl, ConnectionTestResult, WebhookUrls } from '../types'
import { ProviderApiError } from '../types'

function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

export const plivoProvider: ProviderCapabilityImpl = {
  providerType: 'plivo',
  capabilities: ['listNumbers', 'provisionNumbers', 'autoWebhooks'],

  async testConnection(credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const authId = String(credentials.authId ?? '')
    const authToken = String(credentials.authToken ?? '')
    const start = Date.now()
    try {
      const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/`, {
        headers: { Authorization: basicAuth(authId, authToken) },
      })
      if (!res.ok) {
        const text = await res.text()
        return {
          connected: false,
          latencyMs: Date.now() - start,
          error: `Plivo API error: ${res.status}`,
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
    const authId = String(credentials.authId ?? '')
    const authToken = String(credentials.authToken ?? '')
    const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Number/`, {
      headers: { Authorization: basicAuth(authId, authToken) },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to list Plivo numbers', res.status, text)
    }
    const data = (await res.json()) as {
      objects: Array<{
        number: string
        alias: string
        resource_uri: string
        voice_enabled: boolean
        sms_enabled: boolean
      }>
    }
    return (data.objects || []).map((n) => ({
      id: n.number,
      phoneNumber: `+${n.number}`,
      providerType: 'plivo',
      friendlyName: n.alias || `+${n.number}`,
      capabilities: [
        ...(n.voice_enabled ? ['voice'] : []),
        ...(n.sms_enabled ? ['sms'] : []),
      ],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }))
  },

  async searchAvailableNumbers(
    credentials: Record<string, unknown>,
    query: NumberSearchQuery,
  ): Promise<AvailableNumber[]> {
    const authId = String(credentials.authId ?? '')
    const authToken = String(credentials.authToken ?? '')
    const countryIso = query.countryCode ?? 'US'
    const res = await fetch(
      `https://api.plivo.com/v1/Account/${authId}/PhoneNumber/?country_iso=${countryIso}&limit=${Math.min(query.limit ?? 20, 50)}&type=local`,
      { headers: { Authorization: basicAuth(authId, authToken) } },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to search Plivo numbers', res.status, text)
    }
    const data = (await res.json()) as {
      objects: Array<{ number: string; region?: string; monthly_rental_rate?: string }>
    }
    return (data.objects || []).map((n) => ({
      phoneNumber: `+${n.number}`,
      providerType: 'plivo',
      capabilities: ['voice', 'sms'],
      region: n.region,
      monthlyPrice: n.monthly_rental_rate,
    }))
  },

  async provisionNumber(
    credentials: Record<string, unknown>,
    request: NumberProvisionRequest,
  ): Promise<OwnedNumber> {
    const authId = String(credentials.authId ?? '')
    const authToken = String(credentials.authToken ?? '')
    const auth = basicAuth(authId, authToken)

    if (request.phoneNumber) {
      const numStr = request.phoneNumber.replace('+', '')
      const buyRes = await fetch(
        `https://api.plivo.com/v1/Account/${authId}/PhoneNumber/${numStr}/`,
        { method: 'POST', headers: { Authorization: auth } },
      )
      if (!buyRes.ok) {
        const text = await buyRes.text()
        throw new ProviderApiError('Failed to provision Plivo number', buyRes.status, text)
      }
      return {
        id: numStr,
        phoneNumber: `+${numStr}`,
        providerType: 'plivo',
        capabilities: ['voice', 'sms'],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }
    }

    const countryIso = 'US'
    const searchRes = await fetch(
      `https://api.plivo.com/v1/Account/${authId}/PhoneNumber/?country_iso=${countryIso}&limit=1&type=local`,
      { headers: { Authorization: auth } },
    )
    if (!searchRes.ok) {
      const text = await searchRes.text()
      throw new ProviderApiError('Failed to search Plivo numbers', searchRes.status, text)
    }
    const searchData = (await searchRes.json()) as {
      objects: Array<{ number: string }>
    }
    if (!searchData.objects || searchData.objects.length === 0) {
      throw new ProviderApiError('No available numbers found', 404, 'No numbers available')
    }
    const phoneNumber = searchData.objects[0].number

    const buyRes = await fetch(
      `https://api.plivo.com/v1/Account/${authId}/PhoneNumber/${phoneNumber}/`,
      { method: 'POST', headers: { Authorization: auth } },
    )
    if (!buyRes.ok) {
      const text = await buyRes.text()
      throw new ProviderApiError('Failed to provision Plivo number', buyRes.status, text)
    }

    return {
      id: phoneNumber,
      phoneNumber: `+${phoneNumber}`,
      providerType: 'plivo',
      capabilities: ['voice', 'sms'],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }
  },

  async configureWebhooks(
    credentials: Record<string, unknown>,
    number: string,
    urls: WebhookUrls,
  ): Promise<void> {
    const authId = String(credentials.authId ?? '')
    const authToken = String(credentials.authToken ?? '')
    const auth = basicAuth(authId, authToken)

    const appBody: Record<string, unknown> = {
      app_name: `Llamenos - ${urls.voiceIncoming}`,
      answer_url: urls.voiceIncoming,
      answer_method: 'POST',
      hangup_url: urls.voiceStatus,
      hangup_method: 'POST',
    }
    if (urls.sms) {
      appBody.message_url = urls.sms
      appBody.message_method = 'POST'
    }

    const appRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Application/`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(appBody),
    })
    if (!appRes.ok) {
      const text = await appRes.text()
      throw new ProviderApiError('Failed to create Plivo application', appRes.status, text)
    }
    const appData = (await appRes.json()) as { app_id: string }

    const numStr = number.replace('+', '')
    const numRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Number/${numStr}/`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_id: appData.app_id }),
    })
    if (!numRes.ok) {
      const text = await numRes.text()
      throw new ProviderApiError('Failed to associate Plivo number', numRes.status, text)
    }
  },

  async createSipTrunk(): Promise<never> {
    throw new ProviderApiError('Plivo does not support SIP trunk creation', 400, 'Not supported')
  },
}
