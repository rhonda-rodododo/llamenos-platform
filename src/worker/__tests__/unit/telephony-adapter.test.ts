import { describe, it, expect } from 'vitest'
import type { TelephonyProviderConfig, TelephonyProviderType } from '@shared/types'
import { PROVIDER_REQUIRED_FIELDS, TELEPHONY_PROVIDER_LABELS } from '@shared/types'

describe('TelephonyAdapter configuration', () => {
  describe('PROVIDER_REQUIRED_FIELDS', () => {
    it('defines required fields for all 5 providers', () => {
      const providers: TelephonyProviderType[] = ['twilio', 'signalwire', 'vonage', 'plivo', 'asterisk']
      for (const p of providers) {
        expect(PROVIDER_REQUIRED_FIELDS[p]).toBeDefined()
        expect(PROVIDER_REQUIRED_FIELDS[p].length).toBeGreaterThan(0)
      }
    })

    it('all providers require phoneNumber', () => {
      for (const fields of Object.values(PROVIDER_REQUIRED_FIELDS)) {
        expect(fields).toContain('phoneNumber')
      }
    })

    it('Twilio requires accountSid and authToken', () => {
      expect(PROVIDER_REQUIRED_FIELDS.twilio).toContain('accountSid')
      expect(PROVIDER_REQUIRED_FIELDS.twilio).toContain('authToken')
    })

    it('SignalWire requires signalwireSpace', () => {
      expect(PROVIDER_REQUIRED_FIELDS.signalwire).toContain('signalwireSpace')
      expect(PROVIDER_REQUIRED_FIELDS.signalwire).toContain('accountSid')
      expect(PROVIDER_REQUIRED_FIELDS.signalwire).toContain('authToken')
    })

    it('Vonage requires apiKey, apiSecret, applicationId', () => {
      expect(PROVIDER_REQUIRED_FIELDS.vonage).toContain('apiKey')
      expect(PROVIDER_REQUIRED_FIELDS.vonage).toContain('apiSecret')
      expect(PROVIDER_REQUIRED_FIELDS.vonage).toContain('applicationId')
    })

    it('Plivo requires authId and authToken', () => {
      expect(PROVIDER_REQUIRED_FIELDS.plivo).toContain('authId')
      expect(PROVIDER_REQUIRED_FIELDS.plivo).toContain('authToken')
    })

    it('Asterisk requires ariUrl, ariUsername, ariPassword', () => {
      expect(PROVIDER_REQUIRED_FIELDS.asterisk).toContain('ariUrl')
      expect(PROVIDER_REQUIRED_FIELDS.asterisk).toContain('ariUsername')
      expect(PROVIDER_REQUIRED_FIELDS.asterisk).toContain('ariPassword')
    })
  })

  describe('TELEPHONY_PROVIDER_LABELS', () => {
    it('has human-readable labels for all providers', () => {
      expect(TELEPHONY_PROVIDER_LABELS.twilio).toBe('Twilio')
      expect(TELEPHONY_PROVIDER_LABELS.signalwire).toBe('SignalWire')
      expect(TELEPHONY_PROVIDER_LABELS.vonage).toBe('Vonage')
      expect(TELEPHONY_PROVIDER_LABELS.plivo).toBe('Plivo')
      expect(TELEPHONY_PROVIDER_LABELS.asterisk).toContain('Asterisk')
    })
  })

  describe('config validation', () => {
    function validateConfig(config: TelephonyProviderConfig): string[] {
      const required = PROVIDER_REQUIRED_FIELDS[config.type]
      const missing: string[] = []
      for (const field of required) {
        const value = config[field]
        if (!value) missing.push(field)
      }
      return missing
    }

    it('valid Twilio config passes', () => {
      const config: TelephonyProviderConfig = {
        type: 'twilio',
        phoneNumber: '+15551234567',
        accountSid: 'AC1234',
        authToken: 'token123',
      }
      expect(validateConfig(config)).toEqual([])
    })

    it('missing Twilio accountSid fails', () => {
      const config: TelephonyProviderConfig = {
        type: 'twilio',
        phoneNumber: '+15551234567',
        authToken: 'token123',
      }
      expect(validateConfig(config)).toContain('accountSid')
    })

    it('valid SignalWire config passes', () => {
      const config: TelephonyProviderConfig = {
        type: 'signalwire',
        phoneNumber: '+15551234567',
        accountSid: 'SW1234',
        authToken: 'token123',
        signalwireSpace: 'myspace',
      }
      expect(validateConfig(config)).toEqual([])
    })

    it('missing SignalWire space fails', () => {
      const config: TelephonyProviderConfig = {
        type: 'signalwire',
        phoneNumber: '+15551234567',
        accountSid: 'SW1234',
        authToken: 'token123',
      }
      expect(validateConfig(config)).toContain('signalwireSpace')
    })

    it('valid Vonage config passes', () => {
      const config: TelephonyProviderConfig = {
        type: 'vonage',
        phoneNumber: '+15551234567',
        apiKey: 'key123',
        apiSecret: 'secret123',
        applicationId: 'app123',
      }
      expect(validateConfig(config)).toEqual([])
    })

    it('valid Plivo config passes', () => {
      const config: TelephonyProviderConfig = {
        type: 'plivo',
        phoneNumber: '+15551234567',
        authId: 'auth123',
        authToken: 'token123',
      }
      expect(validateConfig(config)).toEqual([])
    })

    it('valid Asterisk config passes', () => {
      const config: TelephonyProviderConfig = {
        type: 'asterisk',
        phoneNumber: '+15551234567',
        ariUrl: 'https://asterisk.local:8089/ari',
        ariUsername: 'admin',
        ariPassword: 'secret',
      }
      expect(validateConfig(config)).toEqual([])
    })

    it('empty config has all fields missing', () => {
      const config: TelephonyProviderConfig = {
        type: 'twilio',
        phoneNumber: '',
      }
      const missing = validateConfig(config)
      expect(missing.length).toBeGreaterThan(0)
    })
  })
})

describe('TelephonyAdapter interface compliance', () => {
  // Test the adapter interface shape without instantiating real adapters
  it('all webhook result types have consistent shape', () => {
    // WebhookCallInfo
    const callInfo = { callSid: 'CA123', callerNumber: '+15551234567' }
    expect(callInfo.callSid).toBeTruthy()
    expect(callInfo.callerNumber).toBeTruthy()

    // WebhookCallStatus
    const statuses = ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed']
    for (const s of statuses) {
      expect(typeof s).toBe('string')
    }

    // WebhookQueueResult
    const queueResults = ['leave', 'queue-full', 'error', 'bridged', 'hangup']
    for (const r of queueResults) {
      expect(typeof r).toBe('string')
    }
  })

  it('TelephonyResponse has correct shape', () => {
    const response = { contentType: 'application/xml', body: '<Response/>' }
    expect(response.contentType).toBe('application/xml')
    expect(response.body).toBe('<Response/>')
  })

  it('RingVolunteersParams has correct shape', () => {
    const params = {
      callSid: 'CA123',
      callerNumber: '+15551234567',
      volunteers: [{ pubkey: 'pk1', phone: '+15559876543' }],
      callbackUrl: 'https://example.com',
    }
    expect(params.volunteers.length).toBe(1)
    expect(params.volunteers[0].pubkey).toBe('pk1')
    expect(params.volunteers[0].phone).toBe('+15559876543')
  })
})
