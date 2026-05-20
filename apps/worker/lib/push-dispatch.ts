/**
 * Push notification dispatch service (Epic 86).
 *
 * Sends encrypted push notifications to mobile devices via APNs (iOS) and
 * ntfy/UnifiedPush (Android). Two-tier encryption: wake key for lock-screen
 * display, device key for full content.
 *
 * Android uses self-hosted ntfy (UnifiedPush) — no Google/Firebase dependency.
 * iOS uses APNs (platform requirement) with wake-only encrypted payloads.
 */

import type { Env, DeviceRecord, WakePayload, FullPushPayload } from '../types'
import type { IdentityService } from '../services/identity'
import type { ShiftsService } from '../services/shifts'
import { encryptWakePayload, encryptFullPayload } from './push-encryption'
import { NtfyClient } from './ntfy-client'

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
  const hasNtfy = !!env.NTFY_URL
  const isDev = env.ENVIRONMENT === 'development'

  if (!hasApns && !hasNtfy) {
    // In development, return a logging-only dispatcher so push payloads are recorded
    if (isDev) {
      return new LoggingPushDispatcher(identityService, shiftsService)
    }
    return new NoopPushDispatcher()
  }

  return new ServicePushDispatcher(env, identityService, shiftsService, hasApns, hasNtfy)
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
  private ntfyClient: NtfyClient | null = null

  constructor(
    private env: Env,
    private identityService: IdentityService,
    private shiftsService: ShiftsService,
    private hasApns: boolean,
    private hasNtfy: boolean,
  ) {
    if (hasNtfy && env.NTFY_URL) {
      this.ntfyClient = new NtfyClient(env.NTFY_URL, env.NTFY_AUTH_TOKEN)
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
    if (device.platform === 'android' && this.ntfyClient) {
      return this.sendNtfy(device.pushToken, encryptedWake, encryptedFull, wake)
    }
    return true
  }

  private async sendApns(
    deviceToken: string,
    encryptedWake: string,
    encryptedFull: string,
    _wake: WakePayload,
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

    // Wake-only APNs payload: NO plaintext title/body/category.
    // The encrypted payload contains all notification content.
    // The app decrypts locally and posts a local notification.
    const notification = new Notification(deviceToken, {
      badge: 1,
      sound: 'default',
      mutableContent: true,
      contentAvailable: true,
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

  /**
   * Send encrypted push payload via ntfy (UnifiedPush) to an Android device.
   *
   * The device's pushToken is the full UnifiedPush endpoint URL registered
   * during device setup (e.g. https://ntfy.example.com/up-topic-xxx).
   * ntfy sees only opaque ciphertext — zero plaintext metadata.
   */
  private async sendNtfy(
    pushEndpoint: string,
    encryptedWake: string,
    encryptedFull: string,
    wake: WakePayload,
  ): Promise<boolean> {
    if (!this.ntfyClient) return true

    // Combine encrypted tiers into a single JSON envelope
    const payload = JSON.stringify({
      encrypted: encryptedWake,
      encryptedFull,
    })

    return this.ntfyClient.send({
      endpoint: pushEndpoint,
      data: payload,
      priority: wake.type === 'shift_reminder' ? 'default' : 'high',
    })
  }
}

// Notification content helpers removed — all push payloads are encrypted.
// The app decrypts locally and generates notification content from the
// wake-tier payload (title, body, category) on the device.
