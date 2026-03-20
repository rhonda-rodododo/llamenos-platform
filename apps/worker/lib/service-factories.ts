import type { Env } from '../types'
import type { TelephonyAdapter } from '../telephony/adapter'
import type { MessagingAdapter } from '../messaging/adapter'
import { type NostrPublisher, createNostrPublisher, NodeNostrPublisher } from './nostr-publisher'
import type { TelephonyProviderConfig, MessagingChannelType, MessagingConfig } from '@shared/types'
import { TwilioAdapter } from '../telephony/twilio'
import { SignalWireAdapter } from '../telephony/signalwire'
import { VonageAdapter } from '../telephony/vonage'
import { PlivoAdapter } from '../telephony/plivo'
import { AsteriskAdapter } from '../telephony/asterisk'
import { createSMSAdapter } from '../messaging/sms/factory'
import { createWhatsAppAdapter } from '../messaging/whatsapp/factory'
import { createSignalAdapter } from '../messaging/signal/factory'
import { createRCSAdapter } from '../messaging/rcs/factory'

/**
 * Create a TelephonyAdapter from SettingsService (service-based version).
 * Reads config via direct service call; falls back to env vars for Twilio.
 */
export async function getTelephonyFromService(
  env: Env,
  settingsService: { getTelephonyProvider(): Promise<TelephonyProviderConfig | null> },
): Promise<TelephonyAdapter | null> {
  try {
    const config = await settingsService.getTelephonyProvider()
    if (config) return createAdapterFromConfig(config)
  } catch {
    // Fall through to env var defaults
  }

  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) {
    return new TwilioAdapter(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_PHONE_NUMBER)
  }

  return null
}

/**
 * Get TelephonyAdapter for a specific hub (service-based version).
 * Falls back to global telephony config, then env vars.
 */
export async function getHubTelephonyFromService(
  env: Env,
  settingsService: {
    getHubTelephonyProvider(hubId: string): Promise<TelephonyProviderConfig | null>
    getTelephonyProvider(): Promise<TelephonyProviderConfig | null>
  },
  hubId: string,
): Promise<TelephonyAdapter | null> {
  try {
    const config = await settingsService.getHubTelephonyProvider(hubId)
    if (config) return createAdapterFromConfig(config)
  } catch {
    // Fall through to global
  }
  return getTelephonyFromService(env, settingsService)
}

/**
 * Get a MessagingAdapter for the specified channel (service-based version).
 * Uses SettingsService instead of DO stubs.
 */
export async function getMessagingAdapterFromService(
  channel: MessagingChannelType,
  settingsService: {
    getMessagingConfig(): Promise<MessagingConfig>
    getTelephonyProvider(): Promise<TelephonyProviderConfig | null>
  },
  hmacSecret: string,
): Promise<MessagingAdapter> {
  const config = await settingsService.getMessagingConfig()
  if (!config || !config.enabledChannels.includes(channel)) {
    throw new Error(`${channel} channel is not enabled`)
  }

  switch (channel) {
    case 'sms': {
      if (!config.sms?.enabled) throw new Error('SMS is not enabled')
      const telConfig = await settingsService.getTelephonyProvider()
      if (!telConfig) throw new Error('SMS requires a configured telephony provider')
      return createSMSAdapter(telConfig, config.sms, hmacSecret)
    }
    case 'whatsapp': {
      if (!config.whatsapp) throw new Error('WhatsApp is not configured')
      return createWhatsAppAdapter(config.whatsapp, hmacSecret)
    }
    case 'signal': {
      if (!config.signal) throw new Error('Signal is not configured')
      return createSignalAdapter(config.signal, hmacSecret)
    }
    case 'rcs': {
      if (!config.rcs) throw new Error('RCS is not configured')
      return createRCSAdapter(config.rcs, hmacSecret)
    }
    default:
      throw new Error(`Unknown channel: ${channel}`)
  }
}

// --- Nostr Publisher (Epic 76.1) ---

let cachedPublisher: NostrPublisher | null = null

/**
 * Get the Nostr event publisher for the current platform.
 * Lazily creates and caches the publisher instance.
 * Returns a NoopNostrPublisher if no relay is configured.
 */
export function getNostrPublisher(env: Env): NostrPublisher {
  if (!cachedPublisher) {
    // Check if a pre-configured publisher was set by createBunEnv() (with outbox wired)
    if (env.NOSTR_PUBLISHER) {
      cachedPublisher = env.NOSTR_PUBLISHER
    } else {
      cachedPublisher = createNostrPublisher(env)
      // Eagerly connect Node.js publisher so events don't queue behind a 2s auth timeout
      if (cachedPublisher instanceof NodeNostrPublisher) {
        cachedPublisher.connect().catch(() => {})
      }
    }
  }
  return cachedPublisher
}

/**
 * Create adapter from saved config.
 * Supports Twilio, SignalWire, Vonage, Plivo, and Asterisk (self-hosted).
 */
function createAdapterFromConfig(config: TelephonyProviderConfig): TelephonyAdapter {
  switch (config.type) {
    case 'twilio':
      return new TwilioAdapter(config.accountSid!, config.authToken!, config.phoneNumber)
    case 'signalwire':
      return new SignalWireAdapter(config.accountSid!, config.authToken!, config.phoneNumber, config.signalwireSpace!)
    case 'vonage':
      return new VonageAdapter(config.apiKey!, config.apiSecret!, config.applicationId!, config.phoneNumber, config.privateKey)
    case 'plivo':
      return new PlivoAdapter(config.authId!, config.authToken!, config.phoneNumber)
    case 'asterisk':
      return new AsteriskAdapter(
        config.ariUrl!,
        config.ariUsername!,
        config.ariPassword!,
        config.phoneNumber,
        config.bridgeCallbackUrl!,
        config.ariPassword!, // Bridge secret uses ARI password as shared secret
      )
    default:
      return new TwilioAdapter(config.accountSid!, config.authToken!, config.phoneNumber)
  }
}
