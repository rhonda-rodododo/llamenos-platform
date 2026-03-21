/**
 * VoIP push notification dispatch (Epic 91).
 *
 * Sends high-priority VoIP push notifications to mobile devices when a call arrives.
 * - iOS: APNs VoIP push via PushKit (wakes app, triggers CallKit immediately)
 * - Android: FCM high-priority data message (wakes app, triggers ConnectionService)
 *
 * VoIP push is separate from regular push (push-dispatch.ts) because:
 * 1. iOS VoIP push uses a different APNs topic (bundleId.voip)
 * 2. The payload is unencrypted (minimal — just callId + caller display)
 * 3. It must be delivered with maximum priority to wake the native SIP stack
 * 4. Regular push goes through two-tier ECIES encryption
 */

import type { Env } from '../types'
import type { IdentityService } from '../services/identity'
import { FcmClient } from './fcm-client'

const APNS_BUNDLE_ID = 'org.llamenos.mobile'

interface VoipDeviceRecord {
  platform: 'ios' | 'android'
  voipToken: string
}

/**
 * Dispatch VoIP push using IdentityService instead of DO stubs.
 */
export async function dispatchVoipPushFromService(
  volunteerPubkeys: string[],
  callId: string,
  callerDisplay: string,
  hubId: string,
  env: Env,
  identityService: IdentityService,
): Promise<void> {
  if (volunteerPubkeys.length === 0) return

  const hasApns = !!(env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APNS_TEAM_ID)
  const hasFcm = !!env.FCM_SERVICE_ACCOUNT_KEY
  if (!hasApns && !hasFcm) return

  const { devices: deviceList } = await identityService.getVoipTokens(volunteerPubkeys)
  if (deviceList.length === 0) return

  console.debug(`[voip-push] Dispatching to ${deviceList.length} devices for call ${callId}`)

  const promises: Promise<void>[] = []

  for (const device of deviceList) {
    if (device.platform === 'ios' && hasApns) {
      promises.push(sendApnsVoipPush(device.voipToken, callId, callerDisplay, hubId, env))
    } else if (device.platform === 'android' && hasFcm) {
      promises.push(sendFcmVoipPush(device.voipToken, callId, callerDisplay, hubId, env))
    }
  }

  await Promise.allSettled(promises)
}

/**
 * Send APNs VoIP push via PushKit.
 * Uses the .voip topic — separate from regular notification topic.
 * Linphone SDK handles the push natively and reports to CallKit.
 */
async function sendApnsVoipPush(
  deviceToken: string,
  callId: string,
  callerDisplay: string,
  hubId: string,
  env: Env,
): Promise<void> {
  try {
    // Dynamic import to avoid loading APNs client when not needed
    const { ApnsClient, Notification } = await import('@fivesheepco/cloudflare-apns2')

    const client = new ApnsClient({
      team: env.APNS_TEAM_ID!,
      keyId: env.APNS_KEY_ID!,
      signingKey: env.APNS_KEY_P8!,
      defaultTopic: `${APNS_BUNDLE_ID}.voip`, // VoIP topic
    })

    const { PushType, Priority } = await import('@fivesheepco/cloudflare-apns2')

    const notification = new Notification(deviceToken, {
      type: PushType.voip,
      priority: Priority.immediate,
      expiration: Math.floor(Date.now() / 1000) + 30, // 30 second TTL
      data: {
        'call-id': callId,
        'caller': callerDisplay,
        'hub-id': hubId,
        'type': 'incoming_call',
      },
    })

    await client.send(notification)
  } catch (err) {
    console.error(`[voip-push] APNs VoIP push failed for ${deviceToken.slice(0, 8)}...:`, err)
  }
}

/**
 * Send FCM high-priority data message for VoIP.
 * Android Linphone SDK processes this to show ConnectionService notification.
 */
async function sendFcmVoipPush(
  fcmToken: string,
  callId: string,
  callerDisplay: string,
  hubId: string,
  env: Env,
): Promise<void> {
  try {
    const fcmClient = new FcmClient(env.FCM_SERVICE_ACCOUNT_KEY!)

    await fcmClient.send({
      token: fcmToken,
      data: {
        type: 'incoming_call',
        'call-id': callId,
        caller: callerDisplay,
        'hub-id': hubId,
      },
      priority: 'high',
      // No title/body — data-only message for native SIP stack handling
    })
  } catch (err) {
    console.error(`[voip-push] FCM VoIP push failed for ${fcmToken.slice(0, 8)}...:`, err)
  }
}
