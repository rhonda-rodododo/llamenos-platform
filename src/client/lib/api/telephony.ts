import { request, hp } from './client'
import type { TelephonyProviderConfig } from '@shared/types'

export type { TelephonyProviderConfig, TelephonyProviderType } from '@shared/types'

// --- Telephony Provider Settings ---

export async function getTelephonyProvider() {
  return request<TelephonyProviderConfig | null>(hp('/settings/telephony-provider'))
}

export async function updateTelephonyProvider(config: TelephonyProviderConfig) {
  // Extract credentials from config — everything except 'type' and 'phoneNumber'
  const { type, phoneNumber, ...rest } = config as unknown as Record<string, unknown>
  const credentials: Record<string, string> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (v != null && v !== '') credentials[k] = String(v)
  }

  await request<{ ok: true }>(hp('/provider-setup/configure'), {
    method: 'POST',
    body: JSON.stringify({
      provider: type,
      credentials,
      phoneNumber,
    }),
  })

  // Return the config as-is since the caller uses it for UI state
  return config
}

export async function testTelephonyProvider(config: Partial<TelephonyProviderConfig> & { type: string }) {
  return request<{ ok: true }>(hp('/settings/telephony-provider/test'), {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

// --- WebRTC Token ---

export async function getWebRtcToken() {
  return request<{ token: string; provider: string; identity: string }>('/telephony/webrtc-token')
}

export async function getWebRtcStatus() {
  return request<{ available: boolean; provider: string | null }>('/telephony/webrtc-status')
}
