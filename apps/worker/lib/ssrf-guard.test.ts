/**
 * Unit tests for SSRF protection utilities.
 *
 * Covers isInternalAddress and validateExternalUrl.
 */

import { describe, it, expect } from 'vitest'
import { isInternalAddress, validateExternalUrl } from './ssrf-guard'

// ---------------------------------------------------------------------------
// isInternalAddress
// ---------------------------------------------------------------------------

describe('isInternalAddress', () => {
  // Loopback
  it('blocks 127.0.0.1', () => expect(isInternalAddress('127.0.0.1')).toBe(true))
  it('blocks 127.0.0.0/8 range', () => expect(isInternalAddress('127.255.255.255')).toBe(true))
  it('blocks ::1 (IPv6 loopback)', () => expect(isInternalAddress('::1')).toBe(true))

  // localhost
  it('blocks "localhost"', () => expect(isInternalAddress('localhost')).toBe(true))
  it('blocks "*.localhost"', () => expect(isInternalAddress('test.localhost')).toBe(true))

  // Private ranges
  it('blocks 10.0.0.0/8', () => expect(isInternalAddress('10.0.0.1')).toBe(true))
  it('blocks 10.255.255.255', () => expect(isInternalAddress('10.255.255.255')).toBe(true))
  it('blocks 172.16.0.0/12 lower', () => expect(isInternalAddress('172.16.0.1')).toBe(true))
  it('blocks 172.31.255.255', () => expect(isInternalAddress('172.31.255.255')).toBe(true))
  it('allows 172.15.0.1 (not in range)', () => expect(isInternalAddress('172.15.0.1')).toBe(false))
  it('allows 172.32.0.1 (not in range)', () => expect(isInternalAddress('172.32.0.1')).toBe(false))
  it('blocks 192.168.0.0/16', () => expect(isInternalAddress('192.168.1.100')).toBe(true))

  // Link-local
  it('blocks 169.254.x.x (link-local)', () => expect(isInternalAddress('169.254.0.1')).toBe(true))
  it('blocks fe80:: (IPv6 link-local)', () => expect(isInternalAddress('fe80::1')).toBe(true))

  // CGNAT
  it('blocks 100.64.0.0/10 (CGNAT)', () => expect(isInternalAddress('100.64.0.1')).toBe(true))
  it('blocks 100.127.255.255', () => expect(isInternalAddress('100.127.255.255')).toBe(true))
  it('allows 100.63.255.255 (not in CGNAT range)', () => expect(isInternalAddress('100.63.255.255')).toBe(false))
  it('allows 100.128.0.0 (not in CGNAT range)', () => expect(isInternalAddress('100.128.0.0')).toBe(false))

  // Reserved
  it('blocks 0.0.0.0', () => expect(isInternalAddress('0.0.0.0')).toBe(true))
  it('blocks 240.0.0.1 (reserved/experimental)', () => expect(isInternalAddress('240.0.0.1')).toBe(true))

  // IPv6 unique local
  it('blocks fc00::/7 (fc)', () => expect(isInternalAddress('fc00::1')).toBe(true))
  it('blocks fd00::/7 (fd)', () => expect(isInternalAddress('fd00::dead:beef')).toBe(true))

  // IPv4-mapped IPv6
  it('blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)', () =>
    expect(isInternalAddress('::ffff:127.0.0.1')).toBe(true))
  it('blocks ::ffff:10.0.0.1 (IPv4-mapped private)', () =>
    expect(isInternalAddress('::ffff:10.0.0.1')).toBe(true))

  // Public addresses (should NOT be blocked)
  it('allows 8.8.8.8 (Google DNS)', () => expect(isInternalAddress('8.8.8.8')).toBe(false))
  it('allows 1.1.1.1 (Cloudflare DNS)', () => expect(isInternalAddress('1.1.1.1')).toBe(false))
  it('allows 93.184.216.34 (example.com)', () => expect(isInternalAddress('93.184.216.34')).toBe(false))
  it('allows 2001:db8::1 (documentation prefix, public)', () =>
    expect(isInternalAddress('2001:db8::1')).toBe(false))

  // IPv6 unspecified
  it('blocks :: (unspecified)', () => expect(isInternalAddress('::')).toBe(true))
})

// ---------------------------------------------------------------------------
// validateExternalUrl
// ---------------------------------------------------------------------------

describe('validateExternalUrl', () => {
  it('returns null for valid public HTTPS URLs', () => {
    expect(validateExternalUrl('https://example.com/path')).toBeNull()
    expect(validateExternalUrl('https://api.stripe.com/v1/charges')).toBeNull()
  })

  it('returns null for valid public HTTP URLs', () => {
    expect(validateExternalUrl('http://example.com')).toBeNull()
  })

  it('returns error for internal hostnames', () => {
    expect(validateExternalUrl('https://localhost/api')).not.toBeNull()
    expect(validateExternalUrl('http://192.168.1.1/admin')).not.toBeNull()
    expect(validateExternalUrl('https://10.0.0.1/secret')).not.toBeNull()
  })

  it('returns error for non-HTTP(S) protocols', () => {
    expect(validateExternalUrl('ftp://example.com')).not.toBeNull()
    expect(validateExternalUrl('file:///etc/passwd')).not.toBeNull()
    expect(validateExternalUrl('javascript:alert(1)')).not.toBeNull()
  })

  it('returns error for malformed URL', () => {
    expect(validateExternalUrl('not-a-url')).not.toBeNull()
    expect(validateExternalUrl('')).not.toBeNull()
  })

  it('error message includes label', () => {
    const result = validateExternalUrl('not-valid', 'webhook URL')
    expect(result).toContain('webhook URL')
  })

  it('uses "URL" as default label', () => {
    const result = validateExternalUrl('not-valid')
    expect(result).toContain('URL')
  })

  it('blocks localhost SSRF via HTTPS', () => {
    expect(validateExternalUrl('https://localhost:8080/api')).not.toBeNull()
  })

  it('blocks 127.0.0.1', () => {
    expect(validateExternalUrl('http://127.0.0.1:9200/')).not.toBeNull()
  })
})
