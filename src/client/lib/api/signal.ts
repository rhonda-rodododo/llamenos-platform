import { request, hp, ApiError } from './client'
import type {
  SignalRegistrationState,
  SignalAccountInfo,
} from '@protocol/schemas/setup'
import type {
  SecurityPrefs,
  SignalIdentityRecord,
  SignalQueueStats,
  SignalContactRecord,
} from '@protocol/schemas/signal-notification'

export type { SignalRegistrationState }
export type { SignalAccountInfo }
export type { SignalIdentityRecord }
export type { SignalQueueStats }
export type { SecurityPrefs, SignalContactRecord }

// --- Signal Registration & Management ---

export async function signalRegister(data: {
  bridgeUrl: string
  bridgeApiKey: string
  phoneNumber: string
  useVoice?: boolean
  captcha?: string
}) {
  return request<SignalRegistrationState>('/setup/signal/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function signalVerify(data: {
  bridgeUrl: string
  bridgeApiKey: string
  phoneNumber: string
  verificationCode: string
}) {
  return request<SignalRegistrationState>('/setup/signal/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function signalUnregister(data: {
  bridgeUrl: string
  bridgeApiKey: string
  registeredNumber: string
}) {
  return request<{ ok: boolean; error?: string }>('/setup/signal/unregister', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getSignalAccountInfo() {
  return request<SignalAccountInfo>('/setup/signal/account')
}

export async function getSignalIdentities() {
  return request<{ identities: SignalIdentityRecord[] }>(hp('/messaging/signal/identities'))
}

export async function updateSignalIdentityTrust(uuid: string, trustLevel: string) {
  return request<{ success: boolean }>(hp('/messaging/signal/identities/trust'), {
    method: 'POST',
    body: JSON.stringify({ uuid, trustLevel }),
  })
}

export async function getSignalQueueStats() {
  return request<SignalQueueStats>(hp('/messaging/signal/queue/stats'))
}

// --- Signal Notification API ---

export async function getSignalContact(): Promise<SignalContactRecord | null> {
  try {
    return await request<SignalContactRecord>('/signal-notification/contact')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function registerSignalContact(body: {
  identifierHash: string
  identifierCiphertext: string
  identifierEnvelope: { recipientPubkey: string; encryptedKey: string }[]
  identifierType: 'phone' | 'username'
}) {
  return request<{ ok: boolean }>('/signal-notification/contact', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function registerSignalContactWithSidecar(body: {
  plaintextIdentifier: string
  identifierType: 'phone' | 'username'
}) {
  return request<{ ok: boolean }>('/signal-notification/contact/sidecar-register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteSignalContact() {
  return request<null>('/signal-notification/contact', { method: 'DELETE' })
}

export async function getSignalHmacKey(): Promise<{ hmacKey: string }> {
  return request<{ hmacKey: string }>('/signal-notification/hmac-key')
}

export async function getSecurityPrefs(): Promise<SecurityPrefs> {
  return request<SecurityPrefs>('/signal-notification/security-prefs')
}

export async function updateSecurityPrefs(patch: Partial<Omit<SecurityPrefs, 'updatedAt'>>) {
  return request<SecurityPrefs>('/signal-notification/security-prefs', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
