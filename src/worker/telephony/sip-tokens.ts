import type { TelephonyProviderConfig, TelephonyProviderType } from '../../shared/types'

/**
 * SIP connection parameters returned to mobile clients.
 * Provider-agnostic — Linphone SDK consumes these directly.
 */
export interface SipConnectionParams {
  provider: TelephonyProviderType
  sip: {
    domain: string
    transport: 'tls' | 'tcp' | 'udp'
    username: string
    password: string
    iceServers: Array<{ url: string; username?: string; credential?: string }>
    mediaEncryption: 'srtp' | 'zrtp' | 'dtls-srtp' | 'none'
  }
}

/**
 * Check whether a provider has SIP endpoints configured for native VoIP clients.
 * All providers support standard SIP — this checks for the necessary credentials.
 */
export function isSipConfigured(config: TelephonyProviderConfig | null): boolean {
  if (!config) return false
  switch (config.type) {
    case 'twilio':
    case 'signalwire':
      // Needs SIP domain + credential list (separate from WebRTC API key)
      return !!(config.accountSid && config.sipDomain && config.sipUsername && config.sipPassword)
    case 'vonage':
      // Vonage requires Asterisk gateway for SIP client registration
      return !!(config.asteriskGateway && config.asteriskSipUsername && config.asteriskSipPassword)
    case 'plivo':
      // Plivo SIP endpoint credentials
      return !!(config.sipEndpointUsername && config.sipEndpointPassword)
    case 'asterisk':
      // Direct Asterisk PJSIP endpoint
      return !!(config.sipDomain && config.sipUsername && config.sipPassword)
    default:
      return false
  }
}

/**
 * Generate SIP connection parameters for a mobile VoIP client.
 * Returns standardized params that Linphone SDK can consume regardless of provider.
 */
export function generateSipParams(
  config: TelephonyProviderConfig,
  identity: string,
): SipConnectionParams {
  switch (config.type) {
    case 'twilio':
      return generateTwilioSipParams(config, identity)
    case 'signalwire':
      return generateSignalWireSipParams(config, identity)
    case 'vonage':
      return generateVonageSipParams(config, identity)
    case 'plivo':
      return generatePlivoSipParams(config, identity)
    case 'asterisk':
      return generateAsteriskSipParams(config, identity)
    default:
      throw new Error(`SIP not supported for provider: ${config.type}`)
  }
}

// --- Per-provider SIP parameter generation ---

function generateTwilioSipParams(
  config: TelephonyProviderConfig,
  _identity: string,
): SipConnectionParams {
  if (!config.sipDomain || !config.sipUsername || !config.sipPassword) {
    throw new Error('Missing Twilio SIP config: sipDomain, sipUsername, sipPassword')
  }

  return {
    provider: 'twilio',
    sip: {
      domain: config.sipDomain,
      transport: 'tls',
      username: config.sipUsername,
      password: config.sipPassword,
      iceServers: [
        { url: 'stun:global.stun.twilio.com:3478' },
      ],
      mediaEncryption: 'srtp',
    },
  }
}

function generateSignalWireSipParams(
  config: TelephonyProviderConfig,
  _identity: string,
): SipConnectionParams {
  if (!config.sipDomain || !config.sipUsername || !config.sipPassword) {
    throw new Error('Missing SignalWire SIP config')
  }

  const space = config.spaceUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? config.sipDomain
  return {
    provider: 'signalwire',
    sip: {
      domain: space,
      transport: 'tls',
      username: config.sipUsername,
      password: config.sipPassword,
      iceServers: [
        { url: `stun:${space}:3478` },
      ],
      mediaEncryption: 'srtp',
    },
  }
}

function generateVonageSipParams(
  config: TelephonyProviderConfig,
  _identity: string,
): SipConnectionParams {
  // Vonage doesn't support SIP client registration directly.
  // Route through Asterisk as a SIP gateway.
  if (!config.asteriskGateway || !config.asteriskSipUsername || !config.asteriskSipPassword) {
    throw new Error('Missing Vonage→Asterisk gateway config')
  }

  return {
    provider: 'vonage',
    sip: {
      domain: config.asteriskGateway,
      transport: 'tls',
      username: config.asteriskSipUsername,
      password: config.asteriskSipPassword,
      iceServers: [
        { url: `stun:${config.asteriskGateway}:3478` },
      ],
      mediaEncryption: 'zrtp', // Asterisk supports ZRTP
    },
  }
}

function generatePlivoSipParams(
  config: TelephonyProviderConfig,
  _identity: string,
): SipConnectionParams {
  if (!config.sipEndpointUsername || !config.sipEndpointPassword) {
    throw new Error('Missing Plivo SIP endpoint config')
  }

  return {
    provider: 'plivo',
    sip: {
      domain: 'phone.plivo.com',
      transport: 'tls',
      username: config.sipEndpointUsername,
      password: config.sipEndpointPassword,
      iceServers: [
        { url: 'stun:stun.plivo.com:3478' },
      ],
      mediaEncryption: 'srtp',
    },
  }
}

function generateAsteriskSipParams(
  config: TelephonyProviderConfig,
  _identity: string,
): SipConnectionParams {
  if (!config.sipDomain || !config.sipUsername || !config.sipPassword) {
    throw new Error('Missing Asterisk SIP config')
  }

  return {
    provider: 'asterisk',
    sip: {
      domain: config.sipDomain,
      transport: 'tls',
      username: config.sipUsername,
      password: config.sipPassword,
      iceServers: [
        { url: `stun:${config.sipDomain}:3478` },
      ],
      mediaEncryption: 'zrtp', // Asterisk supports ZRTP for E2E
    },
  }
}
