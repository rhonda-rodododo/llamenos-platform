/**
 * ntfy push relay client for UnifiedPush (Android) push notifications.
 *
 * Replaces FCM — sends encrypted push payloads to self-hosted ntfy instance.
 * ntfy acts as the UnifiedPush distributor: the Android app registers a topic
 * endpoint, and we publish opaque encrypted blobs to that endpoint.
 *
 * No plaintext content ever reaches ntfy — only HPKE-encrypted wake signals.
 * The ntfy server sees only opaque binary data and the topic name.
 *
 * Even opaque wake signals leak timing metadata (this volunteer was woken, now)
 * to whoever operates the relay, so this client only ever talks to the
 * operator's own relay origin (#960) — see push-endpoint-policy.ts.
 */

import { createLogger } from './logger'
import { resolveTrustedPushOrigins, isTrustedPushEndpoint, type PushRelayEnv } from './push-endpoint-policy'

const logger = createLogger('ntfy')

export interface NtfySendOptions {
  /** Full UnifiedPush endpoint URL registered by the Android device (e.g. https://ntfy.example.com/up-topic-xxx) */
  endpoint: string
  /** Opaque encrypted payload (hex-encoded HPKE ciphertext) */
  data: string
  /** Push priority: 'high' for calls, 'default' for shift reminders */
  priority: 'high' | 'default'
}

export class NtfyClient {
  private baseUrl: string
  private authToken: string | undefined
  private trustedOrigins: string[]

  /**
   * @param baseUrl   relay address as the backend reaches it (NTFY_URL)
   * @param authToken bearer token for the relay
   * @param publicUrl origin devices register, when it differs from baseUrl (NTFY_PUBLIC_URL)
   */
  constructor(baseUrl: string, authToken?: string, publicUrl?: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.authToken = authToken
    this.trustedOrigins = resolveTrustedPushOrigins({ NTFY_URL: baseUrl, NTFY_PUBLIC_URL: publicUrl })
  }

  /**
   * Send an encrypted push payload to a UnifiedPush endpoint.
   *
   * UnifiedPush endpoints are full URLs provided by the distributor (ntfy).
   * We POST the encrypted payload directly to the endpoint URL.
   *
   * Returns true on success, false if the endpoint is invalid/expired (410/404).
   */
  async send(options: NtfySendOptions): Promise<boolean> {
    // #960: pushToken URLs come from client device registration. Only deliver to
    // the operator's own relay origin (exact parsed-origin match, not a prefix
    // test). Anything else — the ntfy app's default ntfy.sh, an attacker-chosen
    // host, an internal address — is refused. Returning false makes the
    // dispatcher drop the stale token.
    // The endpoint URL is itself identifying, so the refusal is logged WITHOUT it.
    if (!isTrustedPushEndpoint(options.endpoint, this.trustedOrigins)) {
      logger.warn('Refused push endpoint outside the configured ntfy origin')
      return false
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    }

    // Map priority to ntfy priority levels
    // ntfy uses 1-5 scale: 5=max, 4=high, 3=default, 2=low, 1=min
    if (options.priority === 'high') {
      headers['Priority'] = '5'
    }

    // Every endpoint that reaches this point is on the operator's own relay
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    try {
      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers,
        body: options.data,
      })

      if (response.ok) {
        return true
      }

      // 404 or 410 = endpoint no longer valid (device unregistered from ntfy)
      if (response.status === 404 || response.status === 410) {
        logger.warn(`Endpoint gone (${response.status})`)
        return false
      }

      // Log unexpected errors but don't crash
      const body = await response.text().catch(() => '')
      logger.error(`ntfy publish failed: ${response.status} ${body.slice(0, 200)}`)
      // Transient error — don't mark endpoint as stale
      throw new Error(`ntfy publish failed: ${response.status}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('ntfy publish failed:')) {
        throw error
      }
      // Network error — transient, retry later
      logger.error('ntfy publish network error', { error })
      throw error
    }
  }

  /**
   * Publish to a topic on the configured ntfy instance.
   * Used for VoIP push where we control the topic naming.
   */
  async publishToTopic(topic: string, data: string, priority: 'high' | 'default'): Promise<boolean> {
    return this.send({
      endpoint: `${this.baseUrl}/${topic}`,
      data,
      priority,
    })
  }
}

/** Build the client from worker env; null when no relay is configured. */
export function createNtfyClient(env: PushRelayEnv & { NTFY_AUTH_TOKEN?: string }): NtfyClient | null {
  if (!env.NTFY_URL) return null
  return new NtfyClient(env.NTFY_URL, env.NTFY_AUTH_TOKEN, env.NTFY_PUBLIC_URL)
}
