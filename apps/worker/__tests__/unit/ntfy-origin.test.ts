/**
 * Unit tests for apps/worker/lib/ntfy-origin.ts (#960).
 */
import { describe, it, expect } from 'vitest'
import {
  buildNtfyOriginPolicy,
  classifyNtfyEndpoint,
  ntfyOriginPolicyFromEnv,
} from '@worker/lib/ntfy-origin'

const policy = buildNtfyOriginPolicy({ baseUrl: 'https://ntfy.example.com/' })

describe('ntfy origin policy', () => {
  it('accepts the exact configured origin', () => {
    expect(classifyNtfyEndpoint('https://ntfy.example.com/up-abc', policy)).toBe('own')
    expect(classifyNtfyEndpoint('https://ntfy.example.com:443/up-abc', policy)).toBe('own')
  })

  it.each([
    'https://ntfy.sh/up-abc',
    'https://ntfy.example.com.evil.tld/up-abc',
    'https://ntfy.example.com@evil.tld/up-abc',
    'https://evil.tld\\@ntfy.example.com/up-abc',
    'https://ntfy.example.com:8443/up-abc',
    'http://ntfy.example.com/up-abc',
    'https://user:pw@ntfy.example.com/up-abc',
    'javascript:alert(1)',
    'ntfy.example.com/up-abc',
    '',
  ])('rejects %s', (endpoint) => {
    expect(classifyNtfyEndpoint(endpoint, policy)).toBe('rejected')
  })

  it('separates own origins from additional operator-approved relays', () => {
    const p = buildNtfyOriginPolicy({
      baseUrl: 'http://ntfy:80',
      publicUrl: 'https://push.example.org',
      allowedOrigins: 'https://relay.example.net, not-a-url ,https://push.example.org',
    })
    expect(p.own).toEqual(['http://ntfy', 'https://push.example.org'])
    expect(p.additional).toEqual(['https://relay.example.net'])
    expect(classifyNtfyEndpoint('https://relay.example.net/x', p)).toBe('additional')
  })

  it('is empty (fails closed) when NTFY_URL is unset, even if overrides are set', () => {
    const p = ntfyOriginPolicyFromEnv({ NTFY_PUBLIC_URL: 'https://push.example.org', NTFY_ALLOWED_ORIGINS: 'https://relay.example.net' })
    expect(p).toEqual({ own: [], additional: [] })
    expect(classifyNtfyEndpoint('https://push.example.org/x', p)).toBe('rejected')
  })
})
