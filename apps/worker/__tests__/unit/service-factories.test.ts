import { describe, it, expect, beforeEach, afterEach, mock, jest } from 'bun:test'
import {
  getTelephonyFromService,
  getHubTelephonyFromService,
  getMessagingAdapterFromService,
  getNostrPublisher,
  _resetNostrPublisherCache,
} from '@worker/lib/service-factories'
import { NodeNostrPublisher } from '@worker/lib/nostr-publisher'
import type { TelephonyProviderConfig, MessagingConfig, MessagingChannelType } from '@shared/types'

mock.module('@worker/telephony/twilio', () => ({
  TwilioAdapter: jest.fn(function (sid: string, token: string, phone: string) {
    return { type: 'twilio', sid, token, phone }
  }),
}))

mock.module('@worker/telephony/signalwire', () => ({
  SignalWireAdapter: jest.fn(function (sid: string, token: string, phone: string, space: string) {
    return { type: 'signalwire', sid, token, phone, space }
  }),
}))

mock.module('@worker/telephony/vonage', () => ({
  VonageAdapter: jest.fn(function (...args: unknown[]) {
    return { type: 'vonage', args }
  }),
}))

mock.module('@worker/telephony/plivo', () => ({
  PlivoAdapter: jest.fn(function (...args: unknown[]) {
    return { type: 'plivo', args }
  }),
}))

mock.module('@worker/telephony/asterisk', () => ({
  AsteriskAdapter: jest.fn(function (...args: unknown[]) {
    return { type: 'asterisk', args }
  }),
}))

mock.module('@worker/telephony/telnyx', () => ({
  TelnyxAdapter: jest.fn(function (...args: unknown[]) {
    return { type: 'telnyx', args }
  }),
}))

mock.module('@worker/telephony/bandwidth', () => ({
  BandwidthAdapter: jest.fn(function (...args: unknown[]) {
    return { type: 'bandwidth', args }
  }),
}))

mock.module('@worker/telephony/freeswitch', () => ({
  FreeSwitchAdapter: jest.fn(function (...args: unknown[]) {
    return { type: 'freeswitch', args }
  }),
}))

mock.module('@worker/messaging/sms/factory', () => ({
  createSMSAdapter: jest.fn().mockImplementation(() => ({ channel: 'sms' })),
}))

mock.module('@worker/messaging/whatsapp/factory', () => ({
  createWhatsAppAdapter: jest.fn().mockImplementation(() => ({ channel: 'whatsapp' })),
}))

mock.module('@worker/messaging/signal/factory', () => ({
  createSignalAdapter: jest.fn().mockImplementation(() => ({ channel: 'signal' })),
}))

mock.module('@worker/messaging/rcs/factory', () => ({
  createRCSAdapter: jest.fn().mockImplementation(() => ({ channel: 'rcs' })),
}))

mock.module('@worker/messaging/telegram/factory', () => ({
  createTelegramAdapter: jest.fn().mockImplementation(() => ({ channel: 'telegram' })),
}))

const mockCreateNostrPublisher = jest.fn()
const mockConnect = jest.fn().mockResolvedValue(undefined)

mock.module('@worker/lib/nostr-publisher', () => ({
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
        getTelephonyProvider: jest.fn().mockResolvedValue(config),
      }
      const env = {} as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter).toBeDefined()
      expect(settingsService.getTelephonyProvider).toHaveBeenCalled()
    })

    it('falls back to env vars when settings fail', async () => {
      const settingsService = {
        getTelephonyProvider: jest.fn().mockRejectedValue(new Error('db down')),
      }
      const env = {
        TWILIO_ACCOUNT_SID: 'AC_fallback',
        TWILIO_AUTH_TOKEN: 'fallback_token',
        TWILIO_PHONE_NUMBER: '+1999',
      } as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter as unknown).toEqual({
        type: 'twilio',
        sid: 'AC_fallback',
        token: 'fallback_token',
        phone: '+1999',
      })
    })

    it('falls back to env vars when settings returns null', async () => {
      const settingsService = {
        getTelephonyProvider: jest.fn().mockResolvedValue(null),
      }
      const env = {
        TWILIO_ACCOUNT_SID: 'AC_fb',
        TWILIO_AUTH_TOKEN: 'tk',
        TWILIO_PHONE_NUMBER: '+1888',
      } as unknown as Parameters<typeof getTelephonyFromService>[0]
      const adapter = await getTelephonyFromService(env, settingsService)
      expect(adapter as unknown).toEqual({
        type: 'twilio',
        sid: 'AC_fb',
        token: 'tk',
        phone: '+1888',
      })
    })

    it('returns null when no config available', async () => {
      const settingsService = {
        getTelephonyProvider: jest.fn().mockResolvedValue(null),
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
        getHubTelephonyProvider: jest.fn().mockResolvedValue(hubConfig),
        getTelephonyProvider: jest.fn().mockResolvedValue(null),
      }
      const env = {} as unknown as Parameters<typeof getHubTelephonyFromService>[0]
      const adapter = await getHubTelephonyFromService(env, settingsService, 'hub-1')
      expect(adapter as unknown).toEqual({
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
        getHubTelephonyProvider: jest.fn().mockResolvedValue(null),
        getTelephonyProvider: jest.fn().mockResolvedValue(globalConfig),
      }
      const env = {} as unknown as Parameters<typeof getHubTelephonyFromService>[0]
      const adapter = await getHubTelephonyFromService(env, settingsService, 'hub-1')
      expect(adapter as unknown).toEqual({
        type: 'twilio',
        sid: 'AC_global',
        token: 'global_token',
        phone: '+2222',
      })
    })

    it('falls back to env vars when both hub and global fail', async () => {
      const settingsService = {
        getHubTelephonyProvider: jest.fn().mockRejectedValue(new Error('fail')),
        getTelephonyProvider: jest.fn().mockRejectedValue(new Error('fail')),
      }
      const env = {
        TWILIO_ACCOUNT_SID: 'AC_env',
        TWILIO_AUTH_TOKEN: 'env_token',
        TWILIO_PHONE_NUMBER: '+3333',
      } as unknown as Parameters<typeof getHubTelephonyFromService>[0]
      const adapter = await getHubTelephonyFromService(env, settingsService, 'hub-1')
      expect(adapter as unknown).toEqual({
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
        getMessagingConfig: jest.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: jest.fn().mockResolvedValue({ type: 'twilio', accountSid: 'AC', authToken: 't', phoneNumber: '+1' } as TelephonyProviderConfig),
      }
      const adapter = await getMessagingAdapterFromService('sms', settingsService, 'secret')
      expect(adapter as unknown).toEqual({ channel: 'sms' })
    })

    it('returns WhatsApp adapter', async () => {
      const settingsService = {
        getMessagingConfig: jest.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: jest.fn(),
      }
      const adapter = await getMessagingAdapterFromService('whatsapp', settingsService, 'secret')
      expect(adapter as unknown).toEqual({ channel: 'whatsapp' })
    })

    it('returns Signal adapter', async () => {
      const settingsService = {
        getMessagingConfig: jest.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: jest.fn(),
      }
      const adapter = await getMessagingAdapterFromService('signal', settingsService, 'secret')
      expect(adapter as unknown).toEqual({ channel: 'signal' })
    })

    it('returns RCS adapter', async () => {
      const settingsService = {
        getMessagingConfig: jest.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: jest.fn(),
      }
      const adapter = await getMessagingAdapterFromService('rcs', settingsService, 'secret')
      expect(adapter as unknown).toEqual({ channel: 'rcs' })
    })

    it('returns Telegram adapter', async () => {
      const settingsService = {
        getMessagingConfig: jest.fn().mockResolvedValue(baseMessagingConfig),
        getTelephonyProvider: jest.fn(),
      }
      const adapter = await getMessagingAdapterFromService('telegram', settingsService, 'secret')
      expect(adapter as unknown).toEqual({ channel: 'telegram' })
    })

    it('throws when channel is not enabled', async () => {
      const config: MessagingConfig = {
        ...baseMessagingConfig,
        enabledChannels: ['sms'],
      }
      const settingsService = {
        getMessagingConfig: jest.fn().mockResolvedValue(config),
        getTelephonyProvider: jest.fn(),
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
        getMessagingConfig: jest.fn().mockResolvedValue(config),
        getTelephonyProvider: jest.fn(),
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
        getMessagingConfig: jest.fn().mockResolvedValue(config),
        getTelephonyProvider: jest.fn().mockResolvedValue(null),
      }
      await expect(getMessagingAdapterFromService('sms', settingsService, 'secret')).rejects.toThrow(
        'SMS requires a configured telephony provider'
      )
    })
  })

  describe('getNostrPublisher', () => {
    it('creates publisher from env when not cached', () => {
      const fakePublisher = { publish: jest.fn(), serverPubkey: 'pub', close: jest.fn() }
      mockCreateNostrPublisher.mockReturnValue(fakePublisher)
      const env = { SERVER_NOSTR_SECRET: 'secret' } as Parameters<typeof getNostrPublisher>[0]
      const result = getNostrPublisher(env)
      expect(mockCreateNostrPublisher).toHaveBeenCalledWith(env)
      expect(result).toBe(fakePublisher)
    })

    it('returns cached publisher on subsequent calls', () => {
      const fakePublisher = { publish: jest.fn(), serverPubkey: 'pub', close: jest.fn() }
      mockCreateNostrPublisher.mockReturnValue(fakePublisher)
      const env = { SERVER_NOSTR_SECRET: 'secret' } as Parameters<typeof getNostrPublisher>[0]
      const first = getNostrPublisher(env)
      const second = getNostrPublisher(env)
      expect(mockCreateNostrPublisher).toHaveBeenCalledTimes(1)
      expect(second).toBe(first)
    })

    it('uses env.NOSTR_PUBLISHER if pre-configured', () => {
      const preConfigured = { publish: jest.fn(), serverPubkey: 'pre', close: jest.fn() }
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
      const fakePublisher = { publish: jest.fn(), serverPubkey: 'pub', close: jest.fn() }
      mockCreateNostrPublisher.mockReturnValue(fakePublisher)
      const env = { SERVER_NOSTR_SECRET: 'secret' } as Parameters<typeof getNostrPublisher>[0]
      getNostrPublisher(env)
      _resetNostrPublisherCache()
      const newFake = { publish: jest.fn(), serverPubkey: 'pub2', close: jest.fn() }
      mockCreateNostrPublisher.mockReturnValue(newFake)
      const result = getNostrPublisher(env)
      expect(result).toBe(newFake)
      expect(mockCreateNostrPublisher).toHaveBeenCalledTimes(2)
    })
  })
})
