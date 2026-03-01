/**
 * FCM HTTP v1 API wrapper for Cloudflare Workers (Epic 86).
 *
 * Uses fcm-cloudflare-workers for JWT-authenticated push delivery.
 * Sends data-only messages with encrypted payloads — Google sees only opaque ciphertext.
 */

import { FCM, FcmOptions } from 'fcm-cloudflare-workers'
import type { FcmServiceAccount } from 'fcm-cloudflare-workers'

export interface FcmSendOptions {
  token: string
  data: Record<string, string>
  channelId?: string
  title?: string
  body?: string
  priority?: 'high' | 'normal'
}

export class FcmClient {
  private fcm: FCM | null = null
  private serviceAccountKey: string

  constructor(serviceAccountKey: string) {
    this.serviceAccountKey = serviceAccountKey
  }

  private getClient(): FCM {
    if (!this.fcm) {
      const serviceAccount = JSON.parse(this.serviceAccountKey) as FcmServiceAccount
      this.fcm = new FCM(new FcmOptions({ serviceAccount }))
    }
    return this.fcm
  }

  /**
   * Send a push notification to an Android device.
   * Returns true on success, false if the token is invalid/expired.
   */
  async send(options: FcmSendOptions): Promise<boolean> {
    const client = this.getClient()

    try {
      await client.sendToToken({
        data: options.data,
        android: {
          priority: options.priority ?? 'high',
          ...(options.title
            ? {
                notification: {
                  channel_id: options.channelId ?? 'messages',
                  title: options.title,
                  body: options.body ?? '',
                  sound: 'default',
                },
              }
            : {}),
        },
      }, options.token)
      return true
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      // Token-related errors — device should be unregistered
      if (
        errMsg.includes('NOT_FOUND') ||
        errMsg.includes('UNREGISTERED') ||
        errMsg.includes('INVALID_ARGUMENT')
      ) {
        return false
      }
      // Transient errors — rethrow for retry
      throw error
    }
  }
}
