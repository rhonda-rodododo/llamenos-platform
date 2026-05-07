import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getTelephonyFromService,
  getHubTelephonyFromService,
  getMessagingAdapterFromService,
  getNostrPublisher,
  _resetNostrPublisherCache,
} from '@worker/lib/service-factories'
import { NoopNostrPublisher } from '@worker/lib/nostr-publisher'

describe('getTelephonyFromService', () => {
  it('returns adapter from service config when available', async () => {
    const settings = {
      getTelephonyProvider: vi.fn().mockResolvedValue({
        type: 'twilio',
        accountSid: 'AC123',
        authToken: 'token',
        phoneNumber: '+15551234567',
      }),
    }

    const adapter = await getTelephonyFromService({} as any, settings)
    expect(adapter).not.toBeNull()
    expect(settings.getTelephonyProvider).toHaveBeenCalled()
  })

  it('falls back to env vars when service fails', async () => {
    const settings = {
      getTelephonyProvider: vi.fn().mockRejectedValue(new Error('DB down')),
    }

    const adapter = await getTelephonyFromService({
      TWILIO_ACCOUNT_SID: 'AC999',
      TWILIO_AUTH_TOKEN: 'fallback-token',
      TWILIO_PHONE_NUMBER: '+15559999999',
    } as any, settings)

    expect(adapter).not.toBeNull()
  })

  it('returns null when no config and no env vars', async () => {
    const settings = {
      getTelephonyProvider: vi.fn().mockResolvedValue(null),
    }

    const adapter = await getTelephonyFromService({} as any, settings)
    expect(adapter).toBeNull()
  })

  it('falls back to env vars when service returns null', async () => {
    const settings = {
      getTelephonyProvider: vi.fn().mockResolvedValue(null),
    }

    const adapter = await getTelephonyFromService({
      TWILIO_ACCOUNT_SID: 'AC111',
      TWILIO_AUTH_TOKEN: 'tk',
      TWILIO_PHONE_NUMBER: '+1555',
    } as any, settings)

    expect(adapter).not.toBeNull()
  })
})

describe('getHubTelephonyFromService', () => {
  it('returns hub-specific adapter when available', async () => {
    const settings = {
      getHubTelephonyProvider: vi.fn().mockResolvedValue({
        type: 'signalwire',
        accountSid: 'hub-sid',
        authToken: 'hub-token',
        phoneNumber: '+15550001111',
        signalwireSpace: 'test.signalwire.com',
      }),
      getTelephonyProvider: vi.fn(),
    }

    const adapter = await getHubTelephonyFromService({} as any, settings, 'hub-123')
    expect(adapter).not.toBeNull()
    expect(settings.getHubTelephonyProvider).toHaveBeenCalledWith('hub-123')
    expect(settings.getTelephonyProvider).not.toHaveBeenCalled()
  })

  it('falls back to global telephony when hub config fails', async () => {
    const settings = {
      getHubTelephonyProvider: vi.fn().mockRejectedValue(new Error('Not configured')),
      getTelephonyProvider: vi.fn().mockResolvedValue({
        type: 'twilio',
        accountSid: 'AC-global',
        authToken: 'global-token',
        phoneNumber: '+15552222222',
      }),
    }

    const adapter = await getHubTelephonyFromService({} as any, settings, 'hub-456')
    expect(adapter).not.toBeNull()
    expect(settings.getTelephonyProvider).toHaveBeenCalled()
  })

  it('falls back to global when hub config returns null', async () => {
    const settings = {
      getHubTelephonyProvider: vi.fn().mockResolvedValue(null),
      getTelephonyProvider: vi.fn().mockResolvedValue({
        type: 'twilio',
        accountSid: 'AC-fallback',
        authToken: 'token',
        phoneNumber: '+15553333333',
      }),
    }

    const adapter = await getHubTelephonyFromService({} as any, settings, 'hub-789')
    expect(adapter).not.toBeNull()
  })
})

describe('getMessagingAdapterFromService', () => {
  const baseConfig = {
    enabledChannels: ['sms', 'whatsapp', 'signal', 'rcs', 'telegram'] as string[],
    sms: { enabled: true },
    whatsapp: { provider: 'twilio', accountSid: 'AC', authToken: 'tk', whatsappNumber: '+1' },
    signal: { bridgeUrl: 'http://signal-cli:8080' },
    rcs: { agentId: 'agent', serviceAccountKey: {} },
    telegram: { botToken: 'bot:token' },
  }

  it('throws when channel is not enabled', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['sms'], // whatsapp not in list
        sms: { enabled: true },
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('whatsapp', settings, 'hmac'),
    ).rejects.toThrow('whatsapp channel is not enabled')
  })

  it('throws for SMS when telephony provider is not configured', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['sms'],
        sms: { enabled: true },
      }),
      getTelephonyProvider: vi.fn().mockResolvedValue(null),
    }

    await expect(
      getMessagingAdapterFromService('sms', settings, 'hmac'),
    ).rejects.toThrow('SMS requires a configured telephony provider')
  })

  it('throws for unknown channel', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['carrier_pigeon' as string],
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('carrier_pigeon' as any, settings, 'hmac'),
    ).rejects.toThrow('Unknown channel: carrier_pigeon')
  })

  it('throws when SMS is in enabledChannels but sms.enabled is false', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['sms'],
        sms: { enabled: false },
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('sms', settings, 'hmac'),
    ).rejects.toThrow('SMS is not enabled')
  })

  it('throws when WhatsApp config is missing', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['whatsapp'],
        // no whatsapp key
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('whatsapp', settings, 'hmac'),
    ).rejects.toThrow('WhatsApp is not configured')
  })

  it('throws when Signal config is missing', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['signal'],
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('signal', settings, 'hmac'),
    ).rejects.toThrow('Signal is not configured')
  })

  it('throws when Telegram config is missing', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['telegram'],
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('telegram', settings, 'hmac'),
    ).rejects.toThrow('Telegram is not configured')
  })

  it('throws when RCS config is missing', async () => {
    const settings = {
      getMessagingConfig: vi.fn().mockResolvedValue({
        enabledChannels: ['rcs'],
      }),
      getTelephonyProvider: vi.fn(),
    }

    await expect(
      getMessagingAdapterFromService('rcs', settings, 'hmac'),
    ).rejects.toThrow('RCS is not configured')
  })
})

describe('getNostrPublisher', () => {
  beforeEach(() => {
    _resetNostrPublisherCache()
  })

  afterEach(() => {
    _resetNostrPublisherCache()
  })

  it('returns NoopNostrPublisher when no server secret', () => {
    const publisher = getNostrPublisher({} as any)
    expect(publisher).toBeInstanceOf(NoopNostrPublisher)
  })

  it('caches the publisher instance', () => {
    const env = {} as any
    const pub1 = getNostrPublisher(env)
    const pub2 = getNostrPublisher(env)
    expect(pub1).toBe(pub2)
  })

  it('uses pre-configured publisher from env.NOSTR_PUBLISHER', () => {
    const preConfigured = new NoopNostrPublisher()
    const publisher = getNostrPublisher({ NOSTR_PUBLISHER: preConfigured } as any)
    expect(publisher).toBe(preConfigured)
  })
})
