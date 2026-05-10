import type {
  OwnedNumber,
  AvailableNumber,
  NumberSearchQuery,
  NumberProvisionRequest,
} from '@protocol/schemas/provider-setup'
import type { ProviderCapabilityImpl, ConnectionTestResult, SipTrunkConfig, WebhookUrls } from '../types'
import { ProviderApiError } from '../types'

function nowISO(): string {
  return new Date().toISOString()
}

export const freeswitchProvider: ProviderCapabilityImpl = {
  providerType: 'freeswitch',
  capabilities: ['sipTrunks'],

  async testConnection(credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const eslHost = String(credentials.eslHost ?? '')
    const eslPort = Number(credentials.eslPort ?? 8021)
    const eslPassword = String(credentials.eslPassword ?? '')
    const start = Date.now()
    try {
      const res = await fetch(`http://${eslHost}:${eslPort}/api/sofia?status`, {
        headers: {
          Authorization: `Basic ${btoa(`:${eslPassword}`)}`,
        },
      })
      if (!res.ok) {
        const text = await res.text()
        return {
          connected: false,
          latencyMs: Date.now() - start,
          error: `FreeSWITCH ESL error: ${res.status}`,
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

  async listOwnedNumbers(): Promise<OwnedNumber[]> {
    throw new ProviderApiError('FreeSWITCH does not support number listing via API', 400, 'Not supported')
  },

  async searchAvailableNumbers(): Promise<AvailableNumber[]> {
    throw new ProviderApiError('FreeSWITCH does not support number search via API', 400, 'Not supported')
  },

  async provisionNumber(): Promise<OwnedNumber> {
    throw new ProviderApiError('FreeSWITCH does not support number provisioning via API', 400, 'Not supported')
  },

  async configureWebhooks(): Promise<void> {
    throw new ProviderApiError('FreeSWITCH does not support webhook configuration via API', 400, 'Not supported')
  },

  async createSipTrunk(
    credentials: Record<string, unknown>,
    domain: string,
  ): Promise<SipTrunkConfig> {
    const eslHost = String(credentials.eslHost ?? '')
    const eslPort = Number(credentials.eslPort ?? 8021)
    const eslPassword = String(credentials.eslPassword ?? '')

    const sipUsername = `llamenos-${crypto.randomUUID().slice(0, 8)}`
    const sipPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 32)

    const res = await fetch(`http://${eslHost}:${eslPort}/api/bgapi`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`:${eslPassword}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `command=sofia profile external gwadd ${sipUsername} ${domain} ${sipUsername} ${sipPassword}`,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to create FreeSWITCH SIP trunk', res.status, text)
    }

    return {
      sipProvider: domain,
      sipUsername,
      sipPassword,
    }
  },
}
