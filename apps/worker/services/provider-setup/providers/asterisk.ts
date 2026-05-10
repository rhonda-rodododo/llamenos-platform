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

export const asteriskProvider: ProviderCapabilityImpl = {
  providerType: 'asterisk',
  capabilities: ['sipTrunks'],

  async testConnection(credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const ariUrl = String(credentials.ariUrl ?? '')
    const ariUsername = String(credentials.ariUsername ?? '')
    const ariPassword = String(credentials.ariPassword ?? '')
    const start = Date.now()
    try {
      const res = await fetch(`${ariUrl}/ari/asterisk/info`, {
        headers: {
          Authorization: `Basic ${btoa(`${ariUsername}:${ariPassword}`)}`,
        },
      })
      if (!res.ok) {
        const text = await res.text()
        return {
          connected: false,
          latencyMs: Date.now() - start,
          error: `Asterisk ARI error: ${res.status}`,
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
    throw new ProviderApiError('Asterisk does not support number listing via API', 400, 'Not supported')
  },

  async searchAvailableNumbers(): Promise<AvailableNumber[]> {
    throw new ProviderApiError('Asterisk does not support number search via API', 400, 'Not supported')
  },

  async provisionNumber(): Promise<OwnedNumber> {
    throw new ProviderApiError('Asterisk does not support number provisioning via API', 400, 'Not supported')
  },

  async configureWebhooks(): Promise<void> {
    throw new ProviderApiError('Asterisk does not support webhook configuration via API', 400, 'Not supported')
  },

  async createSipTrunk(
    credentials: Record<string, unknown>,
    domain: string,
  ): Promise<SipTrunkConfig> {
    const ariUrl = String(credentials.ariUrl ?? '')
    const ariUsername = String(credentials.ariUsername ?? '')
    const ariPassword = String(credentials.ariPassword ?? '')
    const auth = `Basic ${btoa(`${ariUsername}:${ariPassword}`)}`

    const sipUsername = `llamenos-${crypto.randomUUID().slice(0, 8)}`
    const sipPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 32)

    const res = await fetch(`${ariUrl}/ari/asterisk/config/dynamic/res_pjsip/auth/${sipUsername}`, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: [
          { attribute: 'auth_type', value: 'userpass' },
          { attribute: 'username', value: sipUsername },
          { attribute: 'password', value: sipPassword },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new ProviderApiError('Failed to create Asterisk SIP trunk', res.status, text)
    }

    return {
      sipProvider: domain,
      sipUsername,
      sipPassword,
    }
  },
}
