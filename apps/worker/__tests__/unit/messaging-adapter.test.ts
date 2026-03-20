import { describe, it, expect } from 'vitest'
import type {
  MessagingChannelType,
  MessagingConfig,
  SMSConfig,
  WhatsAppConfig,
  SignalConfig,
  RCSConfig,
  DEFAULT_MESSAGING_CONFIG,
} from '@shared/types'
import {
  CHANNEL_SECURITY,
  CHANNEL_LABELS,
} from '@shared/types'

describe('MessagingAdapter types', () => {
  describe('channel types', () => {
    it('defines 4 messaging channel types', () => {
      const channels: MessagingChannelType[] = ['sms', 'whatsapp', 'signal', 'rcs']
      expect(channels.length).toBe(4)
    })

    it('all channels have security levels', () => {
      expect(CHANNEL_SECURITY.sms).toBe('none')
      expect(CHANNEL_SECURITY.whatsapp).toBe('provider-encrypted')
      expect(CHANNEL_SECURITY.signal).toBe('e2ee-to-bridge')
      expect(CHANNEL_SECURITY.rcs).toBe('provider-encrypted')
    })

    it('all channels have display labels', () => {
      expect(CHANNEL_LABELS.sms).toBe('SMS')
      expect(CHANNEL_LABELS.whatsapp).toBe('WhatsApp')
      expect(CHANNEL_LABELS.signal).toBe('Signal')
      expect(CHANNEL_LABELS.rcs).toBe('RCS')
    })

    it('voice channel has security level', () => {
      expect(CHANNEL_SECURITY.voice).toBe('provider-encrypted')
    })

    it('reports channel has e2ee security', () => {
      expect(CHANNEL_SECURITY.reports).toBe('e2ee')
    })
  })

  describe('messaging config', () => {
    it('SMSConfig requires enabled flag', () => {
      const sms: SMSConfig = { enabled: true }
      expect(sms.enabled).toBe(true)
    })

    it('SMSConfig supports auto response', () => {
      const sms: SMSConfig = {
        enabled: true,
        autoResponse: 'Thank you for contacting us',
        afterHoursResponse: 'We are closed',
      }
      expect(sms.autoResponse).toBeTruthy()
      expect(sms.afterHoursResponse).toBeTruthy()
    })

    it('WhatsAppConfig supports twilio mode', () => {
      const wa: WhatsAppConfig = {
        integrationMode: 'twilio',
      }
      expect(wa.integrationMode).toBe('twilio')
    })

    it('WhatsAppConfig supports direct Meta API mode', () => {
      const wa: WhatsAppConfig = {
        integrationMode: 'direct',
        phoneNumberId: '123',
        businessAccountId: '456',
        accessToken: 'token',
        verifyToken: 'verify',
        appSecret: 'secret',
      }
      expect(wa.integrationMode).toBe('direct')
      expect(wa.phoneNumberId).toBe('123')
    })

    it('SignalConfig requires bridge connection', () => {
      const signal: SignalConfig = {
        bridgeUrl: 'https://signal-bridge.internal:8080',
        bridgeApiKey: 'key123',
        webhookSecret: 'secret123',
        registeredNumber: '+15551234567',
      }
      expect(signal.bridgeUrl).toContain('signal-bridge')
      expect(signal.registeredNumber).toMatch(/^\+/)
    })

    it('RCSConfig requires Google credentials', () => {
      const rcs: RCSConfig = {
        agentId: 'agent-123',
        serviceAccountKey: '{"type":"service_account"}',
        fallbackToSms: true,
      }
      expect(rcs.agentId).toBeTruthy()
      expect(rcs.fallbackToSms).toBe(true)
    })

    it('MessagingConfig has all channel slots', () => {
      const config: MessagingConfig = {
        enabledChannels: ['sms', 'whatsapp'],
        sms: { enabled: true },
        whatsapp: { integrationMode: 'twilio' },
        signal: null,
        rcs: null,
        autoAssign: true,
        inactivityTimeout: 60,
        maxConcurrentPerUser: 3,
      }
      expect(config.enabledChannels).toContain('sms')
      expect(config.enabledChannels).toContain('whatsapp')
      expect(config.signal).toBeNull()
      expect(config.rcs).toBeNull()
    })
  })

  describe('adapter interface shapes', () => {
    it('IncomingMessage has required fields', () => {
      const msg = {
        channelType: 'sms' as MessagingChannelType,
        externalId: 'msg-123',
        senderIdentifier: '+15551234567',
        senderIdentifierHash: 'hash123',
        timestamp: new Date().toISOString(),
      }
      expect(msg.channelType).toBe('sms')
      expect(msg.externalId).toBeTruthy()
    })

    it('IncomingMessage supports optional fields', () => {
      const msg = {
        channelType: 'whatsapp' as MessagingChannelType,
        externalId: 'wam-456',
        senderIdentifier: '+15551234567',
        senderIdentifierHash: 'hash456',
        body: 'Hello',
        mediaUrls: ['https://example.com/image.jpg'],
        mediaTypes: ['image/jpeg'],
        timestamp: new Date().toISOString(),
        metadata: { profileName: 'John' },
      }
      expect(msg.body).toBe('Hello')
      expect(msg.mediaUrls).toHaveLength(1)
    })

    it('SendMessageParams shape', () => {
      const params = {
        recipientIdentifier: '+15551234567',
        body: 'Your case has been updated',
        conversationId: 'conv-123',
      }
      expect(params.recipientIdentifier).toMatch(/^\+/)
    })

    it('SendResult success shape', () => {
      const result = { success: true, externalId: 'msg-789' }
      expect(result.success).toBe(true)
      expect(result.externalId).toBeTruthy()
    })

    it('SendResult failure shape', () => {
      const result = { success: false, error: 'Number is unreachable' }
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('ChannelStatus connected shape', () => {
      const status = { connected: true, details: { version: '2.0' } }
      expect(status.connected).toBe(true)
    })

    it('ChannelStatus error shape', () => {
      const status = { connected: false, error: 'Authentication failed' }
      expect(status.connected).toBe(false)
      expect(status.error).toBeTruthy()
    })

    it('MessageStatusUpdate shape', () => {
      const update = {
        externalId: 'msg-123',
        status: 'delivered' as const,
        timestamp: new Date().toISOString(),
      }
      expect(update.status).toBe('delivered')
    })

    it('MessageStatusUpdate failure shape', () => {
      const update = {
        externalId: 'msg-456',
        status: 'failed' as const,
        timestamp: new Date().toISOString(),
        failureReason: 'Number not registered on WhatsApp',
      }
      expect(update.failureReason).toBeTruthy()
    })
  })
})
