import { describe, it, expect, beforeEach, mock, jest } from 'bun:test'
const mockSendToToken = jest.fn()

mock.module('fcm-cloudflare-workers', () => {
  return {
    FCM: jest.fn(function () {
      return { sendToToken: mockSendToToken }
    }),
    FcmOptions: jest.fn(function (this: unknown, opts: unknown) {
      return opts
    }),
  }
})

import { FcmClient } from '@worker/lib/fcm-client'

describe('FcmClient', () => {
  const validServiceAccount = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----',
    client_email: 'test@test-project.iam.gserviceaccount.com',
  })

  beforeEach(() => {
    mockSendToToken.mockReset()
  })

  describe('send', () => {
    it('returns true on successful send', async () => {
      mockSendToToken.mockResolvedValue(undefined)

      const client = new FcmClient(validServiceAccount)
      const result = await client.send({
        token: 'device-token-123',
        data: { messageId: 'msg-1' },
      })

      expect(result).toBe(true)
      expect(mockSendToToken).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { messageId: 'msg-1' },
          android: expect.objectContaining({ priority: 'high' }),
        }),
        'device-token-123',
      )
    })

    it('sends notification when title is provided', async () => {
      mockSendToToken.mockResolvedValue(undefined)

      const client = new FcmClient(validServiceAccount)
      await client.send({
        token: 'device-token-123',
        data: { messageId: 'msg-1' },
        title: 'New Message',
        body: 'You have a new message',
        channelId: 'messages',
        priority: 'normal',
      })

      expect(mockSendToToken).toHaveBeenCalledWith(
        expect.objectContaining({
          android: expect.objectContaining({
            priority: 'normal',
            notification: expect.objectContaining({
              channel_id: 'messages',
              title: 'New Message',
              body: 'You have a new message',
              sound: 'default',
            }),
          }),
        }),
        'device-token-123',
      )
    })

    it('does not include notification block when title is absent', async () => {
      mockSendToToken.mockResolvedValue(undefined)

      const client = new FcmClient(validServiceAccount)
      await client.send({
        token: 'device-token-123',
        data: { messageId: 'msg-1' },
      })

      const payload = mockSendToToken.mock.calls[0][0]
      expect(payload.android.notification).toBeUndefined()
    })

    it('uses default channelId when not provided', async () => {
      mockSendToToken.mockResolvedValue(undefined)

      const client = new FcmClient(validServiceAccount)
      await client.send({
        token: 'device-token-123',
        data: { messageId: 'msg-1' },
        title: 'Alert',
      })

      const payload = mockSendToToken.mock.calls[0][0]
      expect(payload.android.notification.channel_id).toBe('messages')
    })
  })

  describe('token invalidation errors', () => {
    it('returns false on NOT_FOUND error', async () => {
      mockSendToToken.mockImplementation(() =>
        Promise.reject(new Error('NOT_FOUND: Requested entity was not found.')),
      )

      const client = new FcmClient(validServiceAccount)
      const result = await client.send({
        token: 'bad-token',
        data: { messageId: 'msg-1' },
      })

      expect(result).toBe(false)
    })

    it('returns false on UNREGISTERED error', async () => {
      mockSendToToken.mockImplementation(() =>
        Promise.reject(new Error('UNREGISTERED: The registration token is not registered.')),
      )

      const client = new FcmClient(validServiceAccount)
      const result = await client.send({
        token: 'unregistered-token',
        data: { messageId: 'msg-1' },
      })

      expect(result).toBe(false)
    })

    it('rethrows INVALID_ARGUMENT instead of treating it as token invalidation', async () => {
      mockSendToToken.mockImplementation(() =>
        Promise.reject(new Error('INVALID_ARGUMENT: Invalid message payload')),
      )

      const client = new FcmClient(validServiceAccount)
      await expect(
        client.send({
          token: 'token-123',
          data: { messageId: 'msg-1' },
        }),
      ).rejects.toThrow('INVALID_ARGUMENT: Invalid message payload')
    })

    it('rethrows transient errors', async () => {
      mockSendToToken.mockImplementation(() =>
        Promise.reject(new Error('UNAVAILABLE: Service temporarily unavailable')),
      )

      const client = new FcmClient(validServiceAccount)
      await expect(
        client.send({
          token: 'token-123',
          data: { messageId: 'msg-1' },
        }),
      ).rejects.toThrow('UNAVAILABLE: Service temporarily unavailable')
    })

    it('rethrows on non-Error throws', async () => {
      mockSendToToken.mockImplementation(() => Promise.reject('string error'))

      const client = new FcmClient(validServiceAccount)
      await expect(
        client.send({
          token: 'token-123',
          data: { messageId: 'msg-1' },
        }),
      ).rejects.toBe('string error')
    })
  })

  describe('JSON parse error', () => {
    it('throws a clear error when serviceAccountKey is invalid JSON', async () => {
      const client = new FcmClient('not-valid-json')
      await expect(client.send({ token: 'token', data: {} })).rejects.toThrow()
    })

    it('reuses the parsed client across multiple sends', async () => {
      mockSendToToken.mockResolvedValue(undefined)

      const client = new FcmClient(validServiceAccount)
      await client.send({ token: 'token-1', data: {} })
      await client.send({ token: 'token-2', data: {} })

      expect(mockSendToToken).toHaveBeenCalledTimes(2)
    })
  })
})
