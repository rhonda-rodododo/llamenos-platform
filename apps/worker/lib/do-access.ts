import type { Env, DOStub } from '../types'
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

const IDENTITY_ID = 'global-identity'
const SETTINGS_ID = 'global-settings'
const RECORDS_ID = 'global-records'
const SHIFT_ID = 'global-shifts'
const CALL_ID = 'global-calls'
const CONVERSATION_ID = 'global-conversations'
const BLAST_ID = 'global-blasts'
const CONTACT_DIRECTORY_ID = 'global-contacts'
const CASE_MANAGER_ID = 'global-cases'

export interface DurableObjects {
  identity: DOStub
  settings: DOStub
  records: DOStub
  shifts: DOStub
  calls: DOStub
  conversations: DOStub
  blasts: DOStub
  contactDirectory: DOStub
  caseManager: DOStub
}

export function getDOs(env: Env): DurableObjects {
  return {
    identity: env.IDENTITY_DO.get(env.IDENTITY_DO.idFromName(IDENTITY_ID)),
    settings: env.SETTINGS_DO.get(env.SETTINGS_DO.idFromName(SETTINGS_ID)),
    records: env.RECORDS_DO.get(env.RECORDS_DO.idFromName(RECORDS_ID)),
    shifts: env.SHIFT_MANAGER.get(env.SHIFT_MANAGER.idFromName(SHIFT_ID)),
    calls: env.CALL_ROUTER.get(env.CALL_ROUTER.idFromName(CALL_ID)),
    conversations: env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(CONVERSATION_ID)),
    blasts: env.BLAST_DO.get(env.BLAST_DO.idFromName(BLAST_ID)),
    contactDirectory: env.CONTACT_DIRECTORY.get(env.CONTACT_DIRECTORY.idFromName(CONTACT_DIRECTORY_ID)),
    caseManager: env.CASE_MANAGER.get(env.CASE_MANAGER.idFromName(CASE_MANAGER_ID)),
  }
}

export interface HubDurableObjects {
  records: DOStub
  shifts: DOStub
  calls: DOStub
  conversations: DOStub
  blasts: DOStub
  contactDirectory: DOStub
  caseManager: DOStub
}

/**
 * Get DOs scoped to a hub context. When hubId is provided, returns hub-scoped
 * instances for records/shifts/calls/conversations while keeping global identity/settings.
 * When hubId is undefined, returns the global singletons (backwards compatible).
 */
export function getScopedDOs(env: Env, hubId?: string): DurableObjects {
  const global = getDOs(env)
  if (hubId) {
    const hub = getHubDOs(env, hubId)
    return { ...global, ...hub }
  }
  return global
}

export function getHubDOs(env: Env, hubId: string): HubDurableObjects {
  return {
    records: env.RECORDS_DO.get(env.RECORDS_DO.idFromName(hubId)),
    shifts: env.SHIFT_MANAGER.get(env.SHIFT_MANAGER.idFromName(hubId)),
    calls: env.CALL_ROUTER.get(env.CALL_ROUTER.idFromName(hubId)),
    conversations: env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(hubId)),
    blasts: env.BLAST_DO.get(env.BLAST_DO.idFromName(hubId)),
    contactDirectory: env.CONTACT_DIRECTORY.get(env.CONTACT_DIRECTORY.idFromName(hubId)),
    caseManager: env.CASE_MANAGER.get(env.CASE_MANAGER.idFromName(hubId)),
  }
}

/**
 * Create a TelephonyAdapter from provider config.
 * Reads config from SettingsDO; falls back to env vars for Twilio.
 * Returns null if no telephony provider is configured (telephony is optional).
 */
export async function getTelephony(env: Env, dos: DurableObjects): Promise<TelephonyAdapter | null> {
  try {
    const res = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
    if (res.ok) {
      const config = await res.json() as TelephonyProviderConfig | null
      if (config) {
        return createAdapterFromConfig(config)
      }
    }
  } catch {
    // Fall through to env var defaults
  }

  // Fall back to env vars only if they're actually configured
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) {
    return new TwilioAdapter(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_PHONE_NUMBER)
  }

  return null
}

/**
 * Get TelephonyAdapter for a specific hub.
 * Falls back to global telephony config, then env vars.
 */
export async function getHubTelephony(env: Env, hubId: string): Promise<TelephonyAdapter | null> {
  const dos = getDOs(env)
  try {
    const res = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}/telephony-provider`))
    if (res.ok) {
      const config = await res.json() as TelephonyProviderConfig | null
      if (config) return createAdapterFromConfig(config)
    }
  } catch {
    // Fall through to global
  }
  return getTelephony(env, dos)
}

/**
 * Get a MessagingAdapter for the specified channel.
 * Throws if the channel is not configured.
 */
export async function getMessagingAdapter(
  channel: MessagingChannelType,
  dos: DurableObjects,
  hmacSecret: string,
): Promise<MessagingAdapter> {
  const res = await dos.settings.fetch(new Request('http://do/settings/messaging'))
  if (!res.ok) throw new Error('Messaging config not found')

  const config = await res.json() as MessagingConfig | null
  if (!config || !config.enabledChannels.includes(channel)) {
    throw new Error(`${channel} channel is not enabled`)
  }

  switch (channel) {
    case 'sms': {
      if (!config.sms?.enabled) throw new Error('SMS is not enabled')
      // SMS reuses telephony provider credentials
      const telRes = await dos.settings.fetch(new Request('http://do/settings/telephony-provider'))
      if (!telRes.ok) throw new Error('SMS requires a configured telephony provider')
      const telConfig = await telRes.json() as TelephonyProviderConfig | null
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
