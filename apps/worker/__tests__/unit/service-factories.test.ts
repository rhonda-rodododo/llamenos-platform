import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getTelephonyFromService,
  getHubTelephonyFromService,
  getMessagingAdapterFromService,
  getNostrPublisher,
  _resetNostrPublisherCache,
} from '@worker/lib/service-factories'
import { NodeNostrPublisher } from '@worker/lib/nostr-publisher'
import type { TelephonyProviderConfig, MessagingConfig, MessagingChannelType } from '@shared/types'

vi.mock('@worker/telephony/twilio', () => ({
  TwilioAdapter: vi.fn(function (sid: string, token: string, phone: string) {
    return { type: 'twilio', sid, token, phone }
  }),
}))

vi.mock('@worker/telephony/signalwire', () => ({
  SignalWireAdapter: vi.fn(function (sid: string, token: string, phone: string, space: string) {
    return { type: 'signalwire', sid, token, phone, space }
  }),
}))

vi.mock('@worker/telephony/vonage', () => ({
  VonageAdapter: vi.fn(function (...args: unknown[]) {
    return { type: 'vonage', args }
  }),
}))

vi.mock('@worker/telephony/plivo', () => ({
  PlivoAdapter: vi.fn(function (...args: unknown[]) {
    return { type: 'plivo', args }
  }),
}))

vi.mock('@worker/telephony/asterisk', () => ({
  AsteriskAdapter: vi.fn(function (...args: unknown[]) {
    return { type: 'asterisk', args }
  }),
}))

vi.mock('@worker/telephony/telnyx', () => ({
  TelnyxAdapter: vi.fn(function (...args: unknown[]) {
    return { type: 'telnyx', args }
  }),
}))

vi.mock('@worker/telephony/bandwidth', () => ({
  BandwidthAdapter: vi.fn(function (...args: unknown[]) {
    return { type: 'bandwidth', args }
  }),
}))

vi.mock('@worker/telephony/freeswitch', () => ({
  FreeSwitchAdapter: vi.fn(function (...args: unknown[]) {
    return { type: 'freeswitch', args }
  }),
}))

vi.mock('@worker/messaging/sms/factory', () => ({
  createSMSAdapter: vi.fn().mockImplementation(() => ({ channel: 'sms' })),
}))

vi.mock('@worker/messaging/whatsapp/factory', () => ({
  createWhatsAppAdapter: vi.fn().mockImplementation(() => ({ channel: 'whatsapp' })),
}))

vi.mock('@worker/messaging/signal/factory', () => ({
  createSignalAdapter: vi.fn().mockImplementation(() => ({ channel: 'signal' })),
}))

vi.mock('@worker/messaging/rcs/factory', () => ({
  createRCSAdapter: vi.fn().mockImplementation(() => ({ channel: 'rcs' })),
}))

vi.mock('@worker/messaging/telegram/factory', () => ({
  createTelegramAdapter: vi.fn().mockImplementation(() => ({ channel: 'telegram' })),
}))

const mockCreateNostrPublisher = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)

vi.mock('@worker/lib/nostr-publisher', () => ({
  createNostrPublisher: (...args: unknown[]) => mockCreateNostrPublisher(...args),
  NodeNostrPublisher: class MockNodeNostrPublisher {
    connect = mockConnect
  },
}))

describe('service-factories', () => {
  beforeEach(() => {
    _resetNostrPublisherCache()
    mockCreateNostrPublisher.mockClear()
    mockConnect.mockClear()
  })

  afterEach(() => {
    _resetNostrPublisherCache()
  })

  describe('getTelephonyFromService', () => {
    it('returns adapter from settings config', async () => {
      const config: TelephonyProviderConfig = {
        type: 'twilio',
        accountSid: 'AC_test',
        authToken: 'token',
        phoneNumber: '+1234',
      }
      const settingsService = {
        getTelephonyProvider: vi.fn().mockResolvedValue(config),
      }
      const env = {} as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter).toBeDefined()
      expect(settingsService.getTelephonyProvider).toHaveBeenCalled()
    })

    it('falls back to env vars when settings fail', async () => {
      const settingsService = {
        getTelephonyProvider: vi.fn().mockRejectedValue(new Error('db down')),
      }
      const env = {
        TWILIO_ACCOUNT_SID: 'AC_fallback',
        TWILIO_AUTH_TOKEN: 'fallback_token',
        TWILIO_PHONE_NUMBER: '+1999',
      } as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter).toEqual({
        type: 'twilio',
        sid: 'AC_fallback',
        token: 'fallback_token',
        phone: '+1999',
      })
    })

    it('falls back to env vars when settings returns null', async () => {
      const settingsService = {
        getTelephonyProvider: vi.fn().mockResolvedValue(null),
      }
      const env = {
        TWILIO_ACCOUNT_SID: 'AC_fb',
        TWILIO_AUTH_TOKEN: 'tk',
        TWILIO_PHONE_NUMBER: '+1888',
      } as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter).toEqual({
        type: 'twilio',
        sid: 'AC_fb',
        token: 'tk',
        phone: '+1888',
      })
    })

    it('returns null when no config available', async () => {
      const settingsService = {
        getTelephonyProvider: vi.fn().mockResolvedValue(null),
      }
      const env = {} as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter).toBeNull()
    })
  })

  describe('getHubTelephonyFromService', () => {
    it('returns hub-specific config when available', async () => {
      const hubConfig: TelephonyProviderConfig = {
        type: 'signalwire',
        accountSid: 'AC_hub',
        authToken: 'hub_token',
        phoneNumber: '+1111',
        signalwireSpace: 'space',
      }
      const settingsService = {
        getHubTelephonyProvider: vi.fn().mockResolvedValue(hubConfig),
        getTelephonyProvider: vi.fn().mockResolvedValue(null),
      }
      const env = {} as unknown as Parameters<typeof getHubTelephonyFromService>[0]
      const adapter = await getHubTelephonyFromService(env, settingsService, 'hub-1')
      expect(adapter).toEqual({
        type: 'signalwire',
        sid: 'AC_hub',
        token: 'hub_token',
        phone: '+1111',
        space: 'space',
      })
    })

    it('falls back to global telephony config', async () => {
      const globalConfig: TelephonyProviderConfig = {
        type: 'twilio',
        accountSid: 'AC_global',
        authToken: 'global_token',
        phoneNumber: '+2222',
      }
      const settingsService = {
        getHubTelephonyProvider: vi.fn().mockResolvedValue(null),
        getTelephonyProvider: vi.fn().mockResolvedValue(globalConfig),
      }
      const env = {} as unknown as Parameters<typeof getHubTelephonyFromService>[0]
      const adapter = await getHubTelephonyFromService(env, settingsService, 'hub-1')
      expect(adapter).toEqual({
        type: 'twilio',
        sid: 'AC_global',
        token: 'global_token',
        phone: '+2222',
      })
    })

    it('falls back to env vars when both hub and global fail', async () => {
      const settingsService = {
        getHubTelephonyProvider: vi.fn().mockRejectedValue(new Error('fail')),
        getTelephonyProvider: vi.fn().mockRejectedValue(new Error('fail')),
      }
      const env = {
        TWILIO_ACCOUNT_SID: 'AC_env',
        TWILIO_AUTH_TOKEN: 'env_token',
        TWILIO_PHONE_NUMBER: '+3333',
      } as unknown as Parameters<typeof getHubTelephonyFromService>[0]
      const adapter = await getHubTelephonyFromService(env, settingsService, 'hub-1')
      expect(adapter).toEqual({
        type: 'twilio',
        sid: 'AC_env',
        token: 'env_token',
        phone: '+3333',
      })
    })
  })

  describe('getMessagingAdapterFromService', () => {
    const baseMessagingConfig = {
      enabledChannels: ['sms', 'whatsapp', 'signal', 'rcs', 'telegram'] as MessagingChannelType[],
      sms: { enabled: true, provider: 'twilio' },
      whatsapp: { phoneNumberId: '123', accessToken: 'token' },
      signal: { bridgeUrl: 'http://signal:8080', phoneNumber: '+1234' },
      rcs: { agentId: 'agent', brandId: 'brand' },
      telegram: { botToken: 'bot-token' },
    } as unknown as MessagingConfig

    it('returns SMS adapter', async () => {
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: vi.fn().mockResolvedValue({ type: 'twilio', accountSid: 'AC', authToken: 't', phoneNumber: '+1' } as TelephonyProviderConfig),
      }
      const adapter = await getMessagingAdapterFromService('sms', settingsService, 'secret')
      expect(adapter).toEqual({ channel: 'sms' })
    })

    it('returns WhatsApp adapter', async () => {
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: vi.fn(),
      }
      const adapter = await getMessagingAdapterFromService('whatsapp', settingsService, 'secret')
      expect(adapter).toEqual({ channel: 'whatsapp' })
    })

    it('returns Signal adapter', async () => {
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: vi.fn(),
      }
      const adapter = await getMessagingAdapterFromService('signal', settingsService, 'secret')
      expect(adapter).toEqual({ channel: 'signal' })
    })

    it('returns RCS adapter', async () => {
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: vi.fn(),
      }
      const adapter = await getMessagingAdapterFromService('rcs', settingsService, 'secret')
      expect(adapter).toEqual({ channel: 'rcs' })
    })

    it('returns Telegram adapter', async () => {
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: vi.fn(),
      }
      const adapter = await getMessagingAdapterFromService('telegram', settingsService, 'secret')
      expect(adapter).toEqual({ channel: 'telegram' })
    })

    it('throws when channel is not enabled', async () => {
      const config: MessagingConfig = {
        ...baseMessagingConfig,
        enabledChannels: ['sms'],
      }
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(config),
        getTelephonyProvider: vi.fn(),
      }
      await expect(getMessagingAdapterFromService('whatsapp', settingsService, 'secret')).rejects.toThrow(
        'whatsapp channel is not enabled'
      )
    })

    it('throws when SMS is not enabled', async () => {
      const config = {
        ...baseMessagingConfig,
        enabledChannels: ['sms' as MessagingChannelType],
        sms: undefined,
      } as unknown as MessagingConfig
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(config),
        getTelephonyProvider: vi.fn(),
      }
      await expect(getMessagingAdapterFromService('sms', settingsService, 'secret')).rejects.toThrow(
        'SMS is not enabled'
      )
    })

    it('throws when SMS requires telephony provider but none configured', async () => {
      const config: MessagingConfig = {
        ...baseMessagingConfig,
        enabledChannels: ['sms'],
      }
      const settingsService = {
        getMessagingConfig: vi.fn().mockResolvedValue(config),
        getTelephonyProvider: vi.fn().mockResolvedValue(null),
      }
      await expect(getMessagingAdapterFromService('sms', settingsService, 'secret')).rejects.toThrow(
        'SMS requires a configured telephony provider'
      )
    })
  })

  describe('getNostrPublisher', () => {
    it('creates publisher from env when not cached', () => {
      const fakePublisher = { publish: vi.fn(), serverPubkey: 'pub', close: vi.fn() }
      mockCreateNostrPublisher.mockReturnValue(fakePublisher)
      const env = { SERVER_NOSTR_SECRET: 'secret' } as Parameters<typeof getNostrPublisher>[0]
      const result = getNostrPublisher(env)
      expect(mockCreateNostrPublisher).toHaveBeenCalledWith(env)
      expect(result).toBe(fakePublisher)
    })

    it('returns cached publisher on subsequent calls', () => {
      const fakePublisher = { publish: vi.fn(), serverPubkey: 'pub', close: vi.fn() }
      mockCreateNostrPublisher.mockReturnValue(fakePublisher)
      const env = { SERVER_NOSTR_SECRET: 'secret' } as Parameters<typeof getNostrPublisher>[0]
      const first = getNostrPublisher(env)
      const second = getNostrPublisher(env)
      expect(mockCreateNostrPublisher).toHaveBeenCalledTimes(1)
      expect(second).toBe(first)
    })

    it('uses env.NOSTR_PUBLISHER if pre-configured', () => {
      const preConfigured = { publish: vi.fn(), serverPubkey: 'pre', close: vi.fn() }
      const env = { NOSTR_PUBLISHER: preConfigured } as unknown as Parameters<typeof getNostrPublisher>[0]
      const result = getNostrPublisher(env)
      expect(result).toBe(preConfigured)
      expect(mockCreateNostrPublisher).not.toHaveBeenCalled()
    })

    it('calls connect on NodeNostrPublisher eagerly', () => {
      const nodePub = new NodeNostrPublisher('ws://relay', 'a'.repeat(64))
      mockCreateNostrPublisher.mockReturnValue(nodePub)
      const env = { SERVER_NOSTR_SECRET: 'secret', NOSTR_RELAY_URL: 'ws://relay' } as Parameters<typeof getNostrPublisher>[0]
      getNostrPublisher(env)
      expect(mockConnect).toHaveBeenCalled()
    })

    it('allows cache reset for tests', () => {
      const fakePublisher = { publish: vi.fn(), serverPubkey: 'pub', close: vi.fn() }
      mockCreateNostrPublisher.mockReturnValue(fakePublisher)
      const env = { SERVER_NOSTR_SECRET: 'secret' } as Parameters<typeof getNostrPublisher>[0]
      getNostrPublisher(env)
      _resetNostrPublisherCache()
      const newFake = { publish: vi.fn(), serverPubkey: 'pub2', close: vi.fn() }
      mockCreateNostrPublisher.mockReturnValue(newFake)
      const result = getNostrPublisher(env)
      expect(result).toBe(newFake)
      expect(mockCreateNostrPublisher).toHaveBeenCalledTimes(2)
    })
  })
})
