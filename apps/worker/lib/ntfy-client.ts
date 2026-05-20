/**
 * ntfy push relay client for UnifiedPush (Android) push notifications.
 *
 * Replaces FCM — sends encrypted push payloads to self-hosted ntfy instance.
 * ntfy acts as the UnifiedPush distributor: the Android app registers a topic
 * endpoint, and we publish opaque encrypted blobs to that endpoint.
 *
 * No plaintext content ever reaches ntfy — only HPKE-encrypted wake signals.
 * The ntfy server sees only opaque binary data and the topic name.
 */

import { createLogger } from './logger'

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

  constructor(baseUrl: string, authToken?: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.authToken = authToken
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    }

    // Map priority to ntfy priority levels
    // ntfy uses 1-5 scale: 5=max, 4=high, 3=default, 2=low, 1=min
    if (options.priority === 'high') {
      headers['Priority'] = '5'
    }

    // If the endpoint is on our own ntfy instance, add auth
    if (this.authToken && options.endpoint.startsWith(this.baseUrl)) {
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
        logger.warn(`Endpoint gone (${response.status}): ${options.endpoint.slice(0, 40)}...`)
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
