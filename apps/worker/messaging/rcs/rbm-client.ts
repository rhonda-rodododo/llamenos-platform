/**
 * Google RCS Business Messaging REST client.
 * Handles JWT service account auth and RBM API calls.
 */

import type {
  GoogleServiceAccountKey,
  GoogleOAuthTokenResponse,
  RBMSendMessageRequest,
  RBMApiResponse,
  RBMContentMessage,
} from './types'

const RBM_API_BASE = 'https://rcsbusinessmessaging.googleapis.com/v1'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/rcsbusinessmessaging'

export class RBMClient {
  private agentId: string
  private serviceAccountKey: GoogleServiceAccountKey
  private cachedToken: { token: string; expiresAt: number } | null = null

  constructor(agentId: string, serviceAccountKey: GoogleServiceAccountKey) {
    this.agentId = agentId
    this.serviceAccountKey = serviceAccountKey
  }

  /**
   * Create a JWT assertion for service account auth.
   * Uses Web Crypto API (works in Cloudflare Workers).
   */
  private async createJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    const payload = {
      iss: this.serviceAccountKey.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }

    const encodedHeader = base64urlEncode(JSON.stringify(header))
    const encodedPayload = base64urlEncode(JSON.stringify(payload))
    const signingInput = `${encodedHeader}.${encodedPayload}`

    // Import the RSA private key
    const pemContent = this.serviceAccountKey.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s/g, '')
    const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput),
    )

    const encodedSignature = base64urlEncode(String.fromCharCode(...new Uint8Array(signature)))
    return `${signingInput}.${encodedSignature}`
  }

  /**
   * Get an OAuth2 access token, using cache when possible.
   */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token
    }

    const jwt = await this.createJWT()
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OAuth2 token exchange failed: ${res.status} ${text}`)
    }

    const data = await res.json() as GoogleOAuthTokenResponse
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 1 min buffer
    }
    return data.access_token
  }

  /**
   * Send a message to a phone number via RBM API.
   */
  async sendMessage(phoneNumber: string, content: RBMContentMessage): Promise<RBMApiResponse> {
    const token = await this.getAccessToken()
    // Phone number format: strip '+' prefix for RBM API path
    const msisdn = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber
    const url = `${RBM_API_BASE}/phones/${msisdn}/agentMessages?messageId=${crypto.randomUUID()}&agentId=${this.agentId}`

    const body: RBMSendMessageRequest = { contentMessage: content }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return await res.json() as RBMApiResponse
  }

  /**
   * Check if the RBM agent is reachable.
   */
  async checkStatus(): Promise<{ connected: boolean; error?: string }> {
    try {
      const token = await this.getAccessToken()
      // Try listing agent — if token works, we're connected
      const res = await fetch(`${RBM_API_BASE}/phones/+0/agentMessages?agentId=${this.agentId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      // 404 is fine (no messages) — it means auth worked
      return { connected: res.status !== 401 && res.status !== 403 }
    } catch (err) {
      return { connected: false, error: String(err) }
    }
  }
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
