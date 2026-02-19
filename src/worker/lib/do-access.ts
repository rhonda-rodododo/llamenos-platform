import type { Env, DOStub } from '../types'
import type { TelephonyAdapter } from '../telephony/adapter'
import type { MessagingAdapter } from '../messaging/adapter'
import type { TelephonyProviderConfig, MessagingChannelType, MessagingConfig } from '../../shared/types'
import { TwilioAdapter } from '../telephony/twilio'
import { SignalWireAdapter } from '../telephony/signalwire'
import { VonageAdapter } from '../telephony/vonage'
import { PlivoAdapter } from '../telephony/plivo'
import { AsteriskAdapter } from '../telephony/asterisk'
import { createSMSAdapter } from '../messaging/sms/factory'
import { createWhatsAppAdapter } from '../messaging/whatsapp/factory'
import { createSignalAdapter } from '../messaging/signal/factory'

const IDENTITY_ID = 'global-identity'
const SETTINGS_ID = 'global-settings'
const RECORDS_ID = 'global-records'
const SHIFT_ID = 'global-shifts'
const CALL_ID = 'global-calls'
const CONVERSATION_ID = 'global-conversations'

export interface DurableObjects {
  identity: DOStub
  settings: DOStub
  records: DOStub
  shifts: DOStub
  calls: DOStub
  conversations: DOStub
}

export function getDOs(env: Env): DurableObjects {
  return {
    identity: env.IDENTITY_DO.get(env.IDENTITY_DO.idFromName(IDENTITY_ID)),
    settings: env.SETTINGS_DO.get(env.SETTINGS_DO.idFromName(SETTINGS_ID)),
    records: env.RECORDS_DO.get(env.RECORDS_DO.idFromName(RECORDS_ID)),
    shifts: env.SHIFT_MANAGER.get(env.SHIFT_MANAGER.idFromName(SHIFT_ID)),
    calls: env.CALL_ROUTER.get(env.CALL_ROUTER.idFromName(CALL_ID)),
    conversations: env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(CONVERSATION_ID)),
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
 * Get a MessagingAdapter for the specified channel.
 * Throws if the channel is not configured.
 */
export async function getMessagingAdapter(
  channel: MessagingChannelType,
  dos: DurableObjects,
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
      return createSMSAdapter(telConfig, config.sms)
    }
    case 'whatsapp': {
      if (!config.whatsapp) throw new Error('WhatsApp is not configured')
      return createWhatsAppAdapter(config.whatsapp)
    }
    case 'signal': {
      if (!config.signal) throw new Error('Signal is not configured')
      return createSignalAdapter(config.signal)
    }
    default:
      throw new Error(`Unknown channel: ${channel}`)
  }
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
