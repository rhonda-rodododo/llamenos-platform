/**
 * Push notification dispatch service (Epic 86).
 *
 * Sends encrypted push notifications to mobile devices via APNs (iOS) and FCM (Android).
 * Two-tier encryption: wake key for lock-screen display, nsec for full content.
 *
 * Direct APNs/FCM — no third-party intermediary (Expo Push Service not used).
 */

import type { Env, DeviceRecord, WakePayload, FullPushPayload } from '../types'
import type { IdentityService } from '../services/identity'
import type { ShiftsService } from '../services/shifts'
import { encryptWakePayload, encryptFullPayload } from './push-encryption'
import { FcmClient } from './fcm-client'

// ── Test Push Log (dev/test environments only) ────────────────────────────────
// In-memory store for the last dispatched WakePayload — used by BDD tests to
// verify that push payloads carry the correct hubId without real APNs/FCM credentials.

interface TestPushLogEntry {
  wakePayload: WakePayload
  recipientPubkey: string
  recordedAt: string
}

const testPushLog: TestPushLogEntry[] = []

/**
 * Record a dispatched WakePayload for test inspection.
 * Only call this in ENVIRONMENT=development — guarded at call sites.
 */
export function recordTestPushPayload(wakePayload: WakePayload, recipientPubkey: string): void {
  testPushLog.push({ wakePayload, recipientPubkey, recordedAt: new Date().toISOString() })
  // Keep only the last 50 entries to avoid unbounded memory growth
  if (testPushLog.length > 50) testPushLog.splice(0, testPushLog.length - 50)
}

/** Return all recorded push log entries (most recent last). */
export function getTestPushLog(): TestPushLogEntry[] {
  return [...testPushLog]
}

/** Clear the push log — call before each scenario to ensure isolation. */
export function clearTestPushLog(): void {
  testPushLog.splice(0, testPushLog.length)
}

const APNS_BUNDLE_ID = 'org.llamenos.mobile'

export interface PushDispatcher {
  /**
   * Send push notification to a specific user's registered devices.
   */
  sendToVolunteer(
    userPubkey: string,
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
 * Create a PushDispatcher from services (no DO stubs).
 * Returns a no-op dispatcher if push credentials aren't configured.
 * In ENVIRONMENT=development, always returns a logging dispatcher so BDD tests
 * can verify push payload structure without real APNs/FCM credentials.
 */
export function createPushDispatcherFromService(
  env: Env,
  identityService: IdentityService,
  shiftsService: ShiftsService,
): PushDispatcher {
  const hasApns = !!(env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APNS_TEAM_ID)
  const hasFcm = !!env.FCM_SERVICE_ACCOUNT_KEY
  const isDev = env.ENVIRONMENT === 'development'

  if (!hasApns && !hasFcm) {
    // In development, return a logging-only dispatcher so push payloads are recorded
    if (isDev) {
      return new LoggingPushDispatcher(identityService, shiftsService)
    }
    return new NoopPushDispatcher()
  }

  return new ServicePushDispatcher(env, identityService, shiftsService, hasApns, hasFcm)
}

class NoopPushDispatcher implements PushDispatcher {
  async sendToVolunteer(): Promise<void> {}
  async sendToAllOnShift(): Promise<void> {}
}

/**
 * Development-only dispatcher that records payloads in the in-memory log
 * without attempting real APNs/FCM delivery.
 * Used when ENVIRONMENT=development but no push credentials are configured.
 */
class LoggingPushDispatcher implements PushDispatcher {
  constructor(
    private identityService: IdentityService,
    private shiftsService: ShiftsService,
  ) {}

  async sendToVolunteer(
    userPubkey: string,
    wakePayload: WakePayload,
  ): Promise<void> {
    recordTestPushPayload(wakePayload, userPubkey)
  }

  async sendToAllOnShift(
    wakePayload: WakePayload,
  ): Promise<void> {
    const pubkeys = await this.shiftsService.getCurrentVolunteers('')
    for (const pk of pubkeys) {
      recordTestPushPayload(wakePayload, pk)
    }
  }
}

/**
 * Service-based push dispatcher — uses IdentityService and ShiftsService directly.
 */
class ServicePushDispatcher implements PushDispatcher {
  private fcmClient: FcmClient | null = null

  constructor(
    private env: Env,
    private identityService: IdentityService,
    private shiftsService: ShiftsService,
    private hasApns: boolean,
    private hasFcm: boolean,
  ) {
    if (hasFcm && env.FCM_SERVICE_ACCOUNT_KEY) {
      this.fcmClient = new FcmClient(env.FCM_SERVICE_ACCOUNT_KEY)
    }
  }

  async sendToVolunteer(
    userPubkey: string,
    wakePayload: WakePayload,
    fullPayload: FullPushPayload,
  ): Promise<void> {
    const { devices: deviceList } = await this.identityService.getDevices(userPubkey)
    if (deviceList.length === 0) return

    const staleTokens: string[] = []

    for (const device of deviceList) {
      const encryptedWake = encryptWakePayload(wakePayload, device.wakeKeyPublic)
      const encryptedFull = encryptFullPayload(fullPayload, userPubkey)

      const success = await this.sendToDevice(device, encryptedWake, encryptedFull, wakePayload)
      if (!success) {
        staleTokens.push(device.pushToken)
      }
    }

    if (staleTokens.length > 0) {
      await this.identityService.cleanupDevices(userPubkey, staleTokens)
    }
  }

  async sendToAllOnShift(
    wakePayload: WakePayload,
    fullPayload: FullPushPayload,
  ): Promise<void> {
    const pubkeys = await this.shiftsService.getCurrentVolunteers('')
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
    return true
  }

  private async sendApns(
    deviceToken: string,
    encryptedWake: string,
    encryptedFull: string,
    wake: WakePayload,
  ): Promise<boolean> {
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
      if (errMsg.includes('410') || errMsg.includes('BadDeviceToken') || errMsg.includes('Unregistered')) {
        return false
      }
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
