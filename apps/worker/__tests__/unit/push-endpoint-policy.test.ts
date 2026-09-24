/**
 * Unit tests for apps/worker/lib/push-endpoint-policy.ts (#960).
 *
 * The policy decides which UnifiedPush endpoints the backend will POST wake
 * signals to. Origin comparison is on PARSED URLs — never a string prefix.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveTrustedPushOrigins,
  expectedPushOrigin,
  isTrustedPushEndpoint,
  isUrlPushToken,
} from '@worker/lib/push-endpoint-policy'

describe('resolveTrustedPushOrigins', () => {
  it('is empty when nothing is configured (fail closed)', () => {
    expect(resolveTrustedPushOrigins({})).toEqual([])
    expect(resolveTrustedPushOrigins({ NTFY_URL: '', NTFY_PUBLIC_URL: '' })).toEqual([])
  })

  it('normalises to origins: path, trailing slash and default port are dropped', () => {
    expect(resolveTrustedPushOrigins({ NTFY_URL: 'https://push.example.org:443/base/' })).toEqual(['https://push.example.org'])
  })

  it('returns the internal and public origins, de-duplicated', () => {
    expect(resolveTrustedPushOrigins({ NTFY_URL: 'http://ntfy:80', NTFY_PUBLIC_URL: 'https://push.example.org' }))
      .toEqual(['http://ntfy', 'https://push.example.org'])
    expect(resolveTrustedPushOrigins({ NTFY_URL: 'https://push.example.org', NTFY_PUBLIC_URL: 'https://push.example.org/' }))
      .toEqual(['https://push.example.org'])
  })

  it('ignores unparseable or non-http(s) config instead of trusting it', () => {
    expect(resolveTrustedPushOrigins({ NTFY_URL: 'not a url' })).toEqual([])
    expect(resolveTrustedPushOrigins({ NTFY_URL: 'ftp://push.example.org' })).toEqual([])
  })
})

describe('expectedPushOrigin', () => {
  it('prefers the public origin', () => {
    expect(expectedPushOrigin({ NTFY_URL: 'http://ntfy:80', NTFY_PUBLIC_URL: 'https://push.example.org' })).toBe('https://push.example.org')
    expect(expectedPushOrigin({ NTFY_URL: 'https://push.example.org' })).toBe('https://push.example.org')
    expect(expectedPushOrigin({})).toBeNull()
  })
})

describe('isTrustedPushEndpoint', () => {
  const trusted = ['https://push.example.org']

  it('accepts the exact origin, any path/query', () => {
    expect(isTrustedPushEndpoint('https://push.example.org/up-abc?x=1', trusted)).toBe(true)
    expect(isTrustedPushEndpoint('https://PUSH.example.org:443/up-abc', trusted)).toBe(true)
  })

  it.each([
    'https://ntfy.sh/up-abc',
    'https://push.example.org.evil.tld/up-abc',      // prefix-match bypass
    'https://push.example.org@evil.tld/up-abc',      // userinfo: host is evil.tld
    'https://evil@push.example.org/up-abc',          // userinfo on the trusted host
    'https://push.example.org:8443/up-abc',          // different port
    'http://push.example.org/up-abc',                // scheme downgrade
    'https://push.example.org./up-abc',              // trailing-dot host
    'https://sub.push.example.org/up-abc',
    'https:push.example.org.evil.tld/up-abc',
    'javascript:alert(1)',
    'ftp://push.example.org/up-abc',
    '//push.example.org/up-abc',
    'up-abc',
    '',
  ])('refuses %s', (endpoint) => {
    expect(isTrustedPushEndpoint(endpoint, trusted)).toBe(false)
  })

  it('refuses everything when there is no trusted origin', () => {
    expect(isTrustedPushEndpoint('https://push.example.org/up-abc', [])).toBe(false)
  })
})

describe('isUrlPushToken', () => {
  it('treats URL-shaped tokens as endpoints, including slash-less schemes', () => {
    expect(isUrlPushToken('https://ntfy.sh/up-abc')).toBe(true)
    expect(isUrlPushToken('https:evil.example/up-abc')).toBe(true)
  })

  it('leaves opaque APNs-style tokens alone', () => {
    expect(isUrlPushToken('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe(false)
    expect(isUrlPushToken('push-token-race-1-1700000000')).toBe(false)
  })
})
