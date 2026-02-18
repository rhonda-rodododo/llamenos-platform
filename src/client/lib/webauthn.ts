/**
 * WebAuthn client-side helpers for passkey registration, login, and credential management.
 * Uses @simplewebauthn/browser for browser API interaction.
 */

import { startRegistration, startAuthentication, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import * as keyManager from './key-manager'

const API_BASE = '/api'

function getAuthHeaders(): Record<string, string> {
  // Prefer session token if available
  const sessionToken = sessionStorage.getItem('llamenos-session-token')
  if (sessionToken) {
    return { 'Authorization': `Session ${sessionToken}` }
  }
  // Use key manager for Schnorr auth if unlocked
  if (keyManager.isUnlocked()) {
    try {
      const token = keyManager.createAuthToken(Date.now())
      return { 'Authorization': `Bearer ${token}` }
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Check if WebAuthn is supported in this browser.
 */
export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
}

/**
 * Register a new WebAuthn credential (passkey).
 * Requires existing auth (nsec or session token).
 */
export async function registerCredential(label: string): Promise<void> {
  const headers = getAuthHeaders()

  // 1. Get registration options from server
  const optionsRes = await fetch(`${API_BASE}/webauthn/register/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ label }),
  })
  if (!optionsRes.ok) throw new Error('Failed to get registration options')
  const { challengeId, ...optionsJSON } = await optionsRes.json() as PublicKeyCredentialCreationOptionsJSON & { challengeId: string }

  // 2. Create credential via browser WebAuthn API
  const attestation = await startRegistration({ optionsJSON })

  // 3. Verify with server
  const verifyRes = await fetch(`${API_BASE}/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ attestation, label, challengeId }),
  })
  if (!verifyRes.ok) throw new Error('Failed to verify registration')
}

/**
 * Login with a passkey. Returns session token + pubkey.
 * No auth required — uses discoverable credentials.
 */
export async function loginWithPasskey(): Promise<{ token: string; pubkey: string }> {
  // 1. Get authentication options from server (no auth needed)
  const optionsRes = await fetch(`${API_BASE}/webauthn/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!optionsRes.ok) throw new Error('Failed to get authentication options')
  const { challengeId, ...optionsJSON } = await optionsRes.json() as PublicKeyCredentialRequestOptionsJSON & { challengeId: string }

  // 2. Authenticate via browser WebAuthn API
  const assertion = await startAuthentication({ optionsJSON })

  // 3. Verify with server — returns session token
  const verifyRes = await fetch(`${API_BASE}/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assertion, challengeId }),
  })
  if (!verifyRes.ok) throw new Error('Failed to verify authentication')
  return verifyRes.json() as Promise<{ token: string; pubkey: string }>
}

export interface WebAuthnCredentialInfo {
  id: string
  label: string
  backedUp: boolean
  createdAt: string
  lastUsedAt: string
}

/**
 * List registered credentials for the current user.
 */
export async function listCredentials(): Promise<WebAuthnCredentialInfo[]> {
  const headers = getAuthHeaders()
  const res = await fetch(`${API_BASE}/webauthn/credentials`, { headers })
  if (!res.ok) throw new Error('Failed to list credentials')
  const data = await res.json() as { credentials: WebAuthnCredentialInfo[] }
  return data.credentials
}

/**
 * Delete a registered credential.
 */
export async function deleteCredential(id: string): Promise<void> {
  const headers = getAuthHeaders()
  const res = await fetch(`${API_BASE}/webauthn/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error('Failed to delete credential')
}
