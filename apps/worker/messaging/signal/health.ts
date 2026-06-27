import type { SignalConfig } from '@shared/types'
import type { SignalAboutResponse } from './types'
import { safeFetch } from '../../lib/safe-fetch'

export interface BridgeHealthStatus {
  connected: boolean
  signalCliVersion?: string
  apiVersion?: string
  registeredNumber?: string
  error?: string
  lastChecked: string
}

/**
 * Check the health of the signal-cli-rest-api bridge by querying its /v1/about endpoint.
 * Returns version info and connectivity status.
 */
export async function checkBridgeHealth(config: SignalConfig): Promise<BridgeHealthStatus> {
  const bridgeUrl = config.bridgeUrl.replace(/\/+$/, '')
  const lastChecked = new Date().toISOString()

  try {
    const response = await safeFetch(`${bridgeUrl}/v1/about`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.bridgeApiKey}`,
      },
      timeoutMs: 10_000,
      ssrfGuard: false,
    })

    if (!response.ok) {
      return {
        connected: false,
        error: `Bridge returned HTTP ${response.status}: ${response.statusText}`,
        lastChecked,
      }
    }

    const about = await response.json() as SignalAboutResponse

    return {
      connected: true,
      signalCliVersion: about.versions['signal-cli'],
      apiVersion: about.versions['signal-cli-rest-api'],
      registeredNumber: about.number ?? config.registeredNumber,
      lastChecked,
    }
  } catch (err) {
    return {
      connected: false,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
      lastChecked,
    }
  }
}

/**
 * Check whether the configured phone number is registered with Signal
 * by querying the signal-cli-rest-api accounts endpoint.
 */
export async function checkRegistrationStatus(config: SignalConfig): Promise<{
  registered: boolean
  number?: string
  error?: string
}> {
  const bridgeUrl = config.bridgeUrl.replace(/\/+$/, '')

  try {
    const response = await safeFetch(
      `${bridgeUrl}/v1/accounts/${encodeURIComponent(config.registeredNumber)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.bridgeApiKey}`,
        },
        timeoutMs: 10_000,
        ssrfGuard: false,
      },
    )

    if (!response.ok) {
      if (response.status === 404) {
        return {
          registered: false,
          number: config.registeredNumber,
          error: `Number ${config.registeredNumber} is not registered with Signal on this bridge`,
        }
      }
      return {
        registered: false,
        error: `Bridge returned HTTP ${response.status}: ${response.statusText}`,
      }
    }

    return {
      registered: true,
      number: config.registeredNumber,
    }
  } catch (err) {
    return {
      registered: false,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
