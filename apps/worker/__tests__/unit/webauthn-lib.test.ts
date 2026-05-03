/**
 * Unit tests for apps/worker/lib/webauthn.ts
 *
 * Tests the WebAuthn utility functions: generation and verification wrappers.
 * Since these delegate to @simplewebauthn/server, we mock the underlying lib
 * and test our wrappers' parameter mapping.
 */
import { describe, it, expect, vi } from 'vitest'

const mockGenerateRegistrationOptions = vi.fn()
const mockVerifyRegistrationResponse = vi.fn()
const mockGenerateAuthenticationOptions = vi.fn()
const mockVerifyAuthenticationResponse = vi.fn()

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: (...args: unknown[]) => mockGenerateRegistrationOptions(...args),
  verifyRegistrationResponse: (...args: unknown[]) => mockVerifyRegistrationResponse(...args),
  generateAuthenticationOptions: (...args: unknown[]) => mockGenerateAuthenticationOptions(...args),
  verifyAuthenticationResponse: (...args: unknown[]) => mockVerifyAuthenticationResponse(...args),
}))

import { generateRegOptions, verifyRegResponse, generateAuthOptions, verifyAuthResponse } from '@worker/lib/webauthn'

describe('webauthn lib', () => {
  describe('generateRegOptions', () => {
    it('passes correct params to @simplewebauthn/server', async () => {
      mockGenerateRegistrationOptions.mockResolvedValue({ challenge: 'ch' })

      const result = await generateRegOptions(
        { pubkey: 'pk123', name: 'Test User' },
        [{ id: 'cred-1', transports: ['internal'] }] as never,
        'example.com',
        'My App',
      )

      expect(result.challenge).toBe('ch')
      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpName: 'My App',
          rpID: 'example.com',
          userName: 'Test User',
          attestationType: 'none',
          authenticatorSelection: expect.objectContaining({
            userVerification: 'required',
          }),
        }),
      )
    })

    it('uses pubkey prefix when name is empty', async () => {
      mockGenerateRegistrationOptions.mockResolvedValue({ challenge: 'ch' })

      await generateRegOptions(
        { pubkey: '1234567890abcdef1234567890abcdef', name: '' },
        [],
        'example.com',
        'App',
      )

      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          userName: '1234567890abcdef', // First 16 chars
        }),
      )
    })

    it('excludes existing credentials', async () => {
      mockGenerateRegistrationOptions.mockResolvedValue({ challenge: 'ch' })

      await generateRegOptions(
        { pubkey: 'pk', name: 'User' },
        [
          { id: 'cred-1', transports: ['internal'] },
          { id: 'cred-2', transports: ['hybrid', 'usb'] },
        ] as never,
        'example.com',
        'App',
      )

      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: [
            { id: 'cred-1', transports: ['internal'] },
            { id: 'cred-2', transports: ['hybrid', 'usb'] },
          ],
        }),
      )
    })
  })

  describe('verifyRegResponse', () => {
    it('passes params correctly', async () => {
      mockVerifyRegistrationResponse.mockResolvedValue({ verified: true })

      const result = await verifyRegResponse(
        { id: 'resp' } as never,
        'challenge-str',
        'https://example.com',
        'example.com',
      )

      expect(result.verified).toBe(true)
      expect(mockVerifyRegistrationResponse).toHaveBeenCalledWith({
        response: { id: 'resp' },
        expectedChallenge: 'challenge-str',
        expectedOrigin: 'https://example.com',
        expectedRPID: 'example.com',
      })
    })
  })

  describe('generateAuthOptions', () => {
    it('generates options with credentials', async () => {
      mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-ch' })

      const creds = [{ id: 'c1', transports: ['internal'] }] as never
      const result = await generateAuthOptions(creds, 'example.com')

      expect(result.challenge).toBe('auth-ch')
      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'example.com',
          userVerification: 'required',
          allowCredentials: [{ id: 'c1', transports: ['internal'] }],
        }),
      )
    })

    it('passes undefined allowCredentials when no credentials', async () => {
      mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-ch' })

      await generateAuthOptions([], 'example.com')

      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: undefined,
        }),
      )
    })
  })

  describe('verifyAuthResponse', () => {
    it('converts base64url public key to Uint8Array', async () => {
      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      })

      const cred = {
        id: 'cred-1',
        publicKey: 'AQID', // base64url for [1, 2, 3]
        counter: 5,
        transports: ['internal'],
      }

      await verifyAuthResponse(
        { id: 'resp' } as never,
        cred as never,
        'challenge',
        'https://example.com',
        'example.com',
      )

      const call = mockVerifyAuthenticationResponse.mock.calls[0][0]
      expect(call.credential.id).toBe('cred-1')
      expect(call.credential.counter).toBe(5)
      // Public key should be a Uint8Array
      expect(call.credential.publicKey).toBeInstanceOf(Uint8Array)
      expect(Array.from(call.credential.publicKey)).toEqual([1, 2, 3])
    })
  })
})
