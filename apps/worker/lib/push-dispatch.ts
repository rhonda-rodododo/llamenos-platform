/**
 * Push notification dispatch service (Epic 86).
 *
 * Sends encrypted push notifications to mobile devices via APNs (iOS) and FCM (Android).
 * Two-tier encryption: wake key for lock-screen display, nsec for full content.
 *
 * Direct APNs/FCM — no third-party intermediary (Expo Push Service not used).
 */

import type { Env, DeviceRecord, WakePayload, FullPushPayload, DOStub } from '../types'
import { encryptWakePayload, encryptFullPayload } from './push-encryption'
import { FcmClient } from './fcm-client'

const APNS_BUNDLE_ID = 'org.llamenos.mobile'

export interface PushDispatcher {
  /**
   * Send push notification to a specific volunteer's registered devices.
   */
  sendToVolunteer(
    volunteerPubkey: string,
    wakePayload: WakePayload,
    fullPayload: FullPushPayload,
  ): Promise<void>

  /**
   * Send push notification to all on-shift volunteers.
   */
  sendToAllOnShift(
    wakePayload: WakePayload,
    fullPayload: FullPushPayload,
  ): Promise<void>
}

/**
 * Create a PushDispatcher from the environment.
 * Returns a no-op dispatcher if push credentials aren't configured.
 */
export function createPushDispatcher(env: Env, identityDO: DOStub, shiftsDO: DOStub): PushDispatcher {
  const hasApns = !!(env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APNS_TEAM_ID)
  const hasFcm = !!env.FCM_SERVICE_ACCOUNT_KEY

  if (!hasApns && !hasFcm) {
    return new NoopPushDispatcher()
  }

  return new LivePushDispatcher(env, identityDO, shiftsDO, hasApns, hasFcm)
}

class NoopPushDispatcher implements PushDispatcher {
  async sendToVolunteer(): Promise<void> {}
  async sendToAllOnShift(): Promise<void> {}
}

class LivePushDispatcher implements PushDispatcher {
  private fcmClient: FcmClient | null = null

  constructor(
    private env: Env,
    private identityDO: DOStub,
    private shiftsDO: DOStub,
    private hasApns: boolean,
    private hasFcm: boolean,
  ) {
    if (hasFcm && env.FCM_SERVICE_ACCOUNT_KEY) {
      this.fcmClient = new FcmClient(env.FCM_SERVICE_ACCOUNT_KEY)
    }
  }

  async sendToVolunteer(
    volunteerPubkey: string,
    wakePayload: WakePayload,
    fullPayload: FullPushPayload,
  ): Promise<void> {
    const devices = await this.getDevices(volunteerPubkey)
    if (devices.length === 0) return

    const staleTokens: string[] = []

    for (const device of devices) {
      const encryptedWake = encryptWakePayload(wakePayload, device.wakeKeyPublic)
      const encryptedFull = encryptFullPayload(fullPayload, volunteerPubkey)

      const success = await this.sendToDevice(device, encryptedWake, encryptedFull, wakePayload)
      if (!success) {
        staleTokens.push(device.pushToken)
      }
    }

    // Clean up stale tokens
    if (staleTokens.length > 0) {
      await this.removeDevices(volunteerPubkey, staleTokens)
    }
  }

  async sendToAllOnShift(
    wakePayload: WakePayload,
    fullPayload: FullPushPayload,
  ): Promise<void> {
    // Get on-shift volunteer pubkeys from ShiftManagerDO
    const res = await this.shiftsDO.fetch(new Request('http://do/current-volunteers'))
    if (!res.ok) return

    const { pubkeys } = await res.json() as { pubkeys: string[] }

    // Fan out push to all on-shift volunteers
    await Promise.allSettled(
      pubkeys.map(pk => this.sendToVolunteer(pk, wakePayload, fullPayload)),
    )
  }

  private async sendToDevice(
    device: DeviceRecord,
    encryptedWake: string,
    encryptedFull: string,
    wake: WakePayload,
  ): Promise<boolean> {
    if (device.platform === 'ios' && this.hasApns) {
      return this.sendApns(device.pushToken, encryptedWake, encryptedFull, wake)
    }
    if (device.platform === 'android' && this.fcmClient) {
      return this.sendFcm(device.pushToken, encryptedWake, encryptedFull, wake)
    }
    return true // Skip silently if platform not configured
  }

  private async sendApns(
    deviceToken: string,
    encryptedWake: string,
    encryptedFull: string,
    wake: WakePayload,
  ): Promise<boolean> {
    // Dynamic import to avoid loading APNs library when not configured
    const { ApnsClient, Notification } = await import(
      '@fivesheepco/cloudflare-apns2'
    )

    const apns = new ApnsClient({
      team: this.env.APNS_TEAM_ID!,
      keyId: this.env.APNS_KEY_ID!,
      signingKey: this.env.APNS_KEY_P8!,
      defaultTopic: APNS_BUNDLE_ID,
    })

    const notification = new Notification(deviceToken, {
      alert: { title: notificationTitle(wake), body: notificationBody(wake) },
      badge: 1,
      sound: 'default',
      mutableContent: true,
      category: notificationCategory(wake),
      data: {
        encrypted: encryptedWake,
        encryptedFull,
      },
    })

    try {
      await apns.send(notification)
      return true
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      // 410 Gone or BadDeviceToken — stale token
      if (errMsg.includes('410') || errMsg.includes('BadDeviceToken') || errMsg.includes('Unregistered')) {
        return false
      }
      // Other errors — don't remove token
      return true
    }
  }

  private async sendFcm(
    deviceToken: string,
    encryptedWake: string,
    encryptedFull: string,
    wake: WakePayload,
  ): Promise<boolean> {
    if (!this.fcmClient) return true

    return this.fcmClient.send({
      token: deviceToken,
      data: {
        encrypted: encryptedWake,
        encryptedFull,
        type: wake.type,
      },
      channelId: notificationChannel(wake),
      title: notificationTitle(wake),
      body: notificationBody(wake),
      priority: wake.type === 'shift_reminder' ? 'normal' : 'high',
    })
  }

  private async getDevices(volunteerPubkey: string): Promise<DeviceRecord[]> {
    const res = await this.identityDO.fetch(
      new Request(`http://do/devices/${volunteerPubkey}`),
    )
    if (!res.ok) return []
    const data = await res.json() as { devices: DeviceRecord[] }
    return data.devices ?? []
  }

  private async removeDevices(volunteerPubkey: string, tokens: string[]): Promise<void> {
    await this.identityDO.fetch(
      new Request(`http://do/devices/${volunteerPubkey}/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens }),
      }),
    )
  }
}

// --- Notification content helpers (generic, not PII) ---

function notificationTitle(wake: WakePayload): string {
  switch (wake.type) {
    case 'message': return 'New Message'
    case 'voicemail': return 'New Voicemail'
    case 'shift_reminder': return 'Shift Starting Soon'
    case 'assignment': return 'Conversation Assigned'
    default: return 'Notification'
  }
}

function notificationBody(wake: WakePayload): string {
  switch (wake.type) {
    case 'message': return 'You have a new message in a conversation.'
    case 'voicemail': return 'A voicemail was left on the hotline.'
    case 'shift_reminder': return 'Your shift starts in 15 minutes.'
    case 'assignment': return 'A conversation has been assigned to you.'
    default: return 'Open the app for details.'
  }
}

function notificationCategory(wake: WakePayload): string {
  switch (wake.type) {
    case 'message':
    case 'assignment':
      return 'message'
    case 'voicemail': return 'voicemail'
    case 'shift_reminder': return 'shift'
    default: return 'default'
  }
}

function notificationChannel(wake: WakePayload): string {
  switch (wake.type) {
    case 'message':
    case 'assignment':
      return 'messages'
    case 'voicemail': return 'voicemail'
    case 'shift_reminder': return 'shifts'
    default: return 'messages'
  }
}
