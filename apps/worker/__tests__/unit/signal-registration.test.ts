/**
 * Unit tests for apps/worker/messaging/signal/registration.ts
 *
 * Tests Signal registration flow: startRegistration, verifyRegistration,
 * unregisterNumber, getAccountInfo, buildSignalConfig.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  startRegistration,
  verifyRegistration,
  unregisterNumber,
  getAccountInfo,
  buildSignalConfig,
} from '@worker/messaging/signal/registration'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startRegistration', () => {
  const baseParams = {
    bridgeUrl: 'https://signal-bridge.example.com/',
    bridgeApiKey: 'test-api-key',
    phoneNumber: '+15551234567',
  }

  it('returns pending_verification on successful request', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    const result = await startRegistration(baseParams)

    expect(result.step).toBe('pending_verification')
    expect(result.number).toBe('+15551234567')
    expect(result.bridgeUrl).toBe('https://signal-bridge.example.com')
    expect(result.startedAt).toBeDefined()
  })

  it('strips trailing slashes from bridgeUrl', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await startRegistration({
      ...baseParams,
      bridgeUrl: 'https://bridge.example.com///',
    })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl.startsWith('https://bridge.example.com/v1/register/')).toBe(true)
  })

  it('sends correct request body with useVoice=true', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await startRegistration({ ...baseParams, useVoice: true })

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.use_voice).toBe(true)
  })

  it('sends captcha when provided', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await startRegistration({ ...baseParams, captcha: 'captcha-token-123' })

    const fetchCall = mockFetch.mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.captcha).toBe('captcha-token-123')
  })

  it('returns failed with captcha message on 403', async () => {
    mockFetch.mockResolvedValue(new Response('captcha required', { status: 403 }))

    const result = await startRegistration(baseParams)

    expect(result.step).toBe('failed')
    expect(result.error).toContain('captcha')
    expect(result.error).toContain('signalcaptchas.org')
  })

  it('returns failed with captcha message when response mentions captcha', async () => {
    mockFetch.mockResolvedValue(new Response('Captcha needed for this operation', { status: 400 }))

    const result = await startRegistration(baseParams)

    expect(result.step).toBe('failed')
    expect(result.error).toContain('captcha')
  })

  it('returns failed with HTTP error on other error statuses', async () => {
    mockFetch.mockResolvedValue(new Response('internal error', { status: 500 }))

    const result = await startRegistration(baseParams)

    expect(result.step).toBe('failed')
    expect(result.error).toContain('HTTP 500')
    expect(result.error).toContain('internal error')
  })

  it('returns failed when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await startRegistration(baseParams)

    expect(result.step).toBe('failed')
    expect(result.error).toContain('Bridge unreachable')
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('URL-encodes the phone number', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await startRegistration({ ...baseParams, phoneNumber: '+1 555 123 4567' })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain(encodeURIComponent('+1 555 123 4567'))
  })

  it('sends Authorization header with bearer token', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await startRegistration(baseParams)

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer test-api-key')
  })
})

describe('verifyRegistration', () => {
  const baseParams = {
    bridgeUrl: 'https://signal-bridge.example.com',
    bridgeApiKey: 'test-api-key',
    phoneNumber: '+15551234567',
    verificationCode: '123456',
  }

  it('returns verified on successful verification', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    const result = await verifyRegistration(baseParams)

    expect(result.step).toBe('verified')
    expect(result.number).toBe('+15551234567')
  })

  it('includes verification code in URL path', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await verifyRegistration(baseParams)

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/verify/123456')
  })

  it('returns failed on HTTP error', async () => {
    mockFetch.mockResolvedValue(new Response('Invalid code', { status: 400 }))

    const result = await verifyRegistration(baseParams)

    expect(result.step).toBe('failed')
    expect(result.error).toContain('HTTP 400')
  })

  it('returns failed on network error', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'))

    const result = await verifyRegistration(baseParams)

    expect(result.step).toBe('failed')
    expect(result.error).toContain('Bridge unreachable')
  })
})

describe('unregisterNumber', () => {
  const config = {
    bridgeUrl: 'https://signal-bridge.example.com/',
    bridgeApiKey: 'key',
    webhookSecret: 'secret',
    registeredNumber: '+15551234567',
  }

  it('returns success on 200', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    const result = await unregisterNumber(config)

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('calls correct URL with POST method', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await unregisterNumber(config)

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/v1/unregister/')
    expect(calledUrl).toContain(encodeURIComponent('+15551234567'))
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })

  it('returns failure on HTTP error', async () => {
    mockFetch.mockResolvedValue(new Response('Not found', { status: 404 }))

    const result = await unregisterNumber(config)

    expect(result.success).toBe(false)
    expect(result.error).toContain('HTTP 404')
  })

  it('returns failure on network error', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'))

    const result = await unregisterNumber(config)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Bridge unreachable')
  })
})

describe('getAccountInfo', () => {
  const config = {
    bridgeUrl: 'https://signal-bridge.example.com',
    bridgeApiKey: 'key',
    webhookSecret: 'secret',
    registeredNumber: '+15551234567',
  }

  it('returns registered=true with uuid and devices on full success', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '0.1.0' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: 'uuid-123' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: 'main' }]), { status: 200 }))

    const result = await getAccountInfo(config)

    expect(result.registered).toBe(true)
    expect(result.number).toBe('+15551234567')
    expect(result.uuid).toBe('uuid-123')
    expect(result.devices).toEqual([{ id: 1, name: 'main' }])
  })

  it('returns registered=false when about endpoint fails', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 500 }))

    const result = await getAccountInfo(config)

    expect(result.registered).toBe(false)
    expect(result.error).toContain('HTTP 500')
  })

  it('returns registered=false with specific message on 404 account', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '0.1.0' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))

    const result = await getAccountInfo(config)

    expect(result.registered).toBe(false)
    expect(result.error).toContain('not registered')
  })

  it('handles devices endpoint failure gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '0.1.0' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: 'uuid-123' }), { status: 200 }))
      .mockRejectedValueOnce(new Error('not supported'))

    const result = await getAccountInfo(config)

    expect(result.registered).toBe(true)
    expect(result.devices).toBeUndefined()
  })

  it('returns registered=false on network error', async () => {
    mockFetch.mockRejectedValue(new Error('DNS resolution failed'))

    const result = await getAccountInfo(config)

    expect(result.registered).toBe(false)
    expect(result.error).toContain('Bridge unreachable')
  })
})

describe('buildSignalConfig', () => {
  it('returns a complete SignalConfig object', () => {
    const config = buildSignalConfig({
      bridgeUrl: 'https://bridge.example.com',
      bridgeApiKey: 'api-key',
      webhookSecret: 'webhook-secret',
      registeredNumber: '+15551234567',
      autoResponse: 'Thanks for your message',
      afterHoursResponse: 'We are closed',
    })

    expect(config).toEqual({
      bridgeUrl: 'https://bridge.example.com',
      bridgeApiKey: 'api-key',
      webhookSecret: 'webhook-secret',
      registeredNumber: '+15551234567',
      autoResponse: 'Thanks for your message',
      afterHoursResponse: 'We are closed',
    })
  })

  it('handles undefined optional fields', () => {
    const config = buildSignalConfig({
      bridgeUrl: 'https://bridge.example.com',
      bridgeApiKey: 'api-key',
      webhookSecret: 'webhook-secret',
      registeredNumber: '+15551234567',
    })

    expect(config.autoResponse).toBeUndefined()
    expect(config.afterHoursResponse).toBeUndefined()
  })
})
