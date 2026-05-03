import { describe, it, expect } from 'bun:test'
import { isInternalAddress, validateExternalUrl } from '@worker/lib/ssrf-guard'

describe('isInternalAddress', () => {
  describe('IPv4 loopback', () => {
    it('blocks 127.0.0.1', () => {
      expect(isInternalAddress('127.0.0.1')).toBe(true)
    })

    it('blocks any 127.x.x.x', () => {
      expect(isInternalAddress('127.0.0.2')).toBe(true)
      expect(isInternalAddress('127.255.255.255')).toBe(true)
    })
  })

  describe('IPv4 private ranges', () => {
    it('blocks 10.0.0.0/8', () => {
      expect(isInternalAddress('10.0.0.1')).toBe(true)
      expect(isInternalAddress('10.255.255.255')).toBe(true)
    })

    it('blocks 172.16.0.0/12', () => {
      expect(isInternalAddress('172.16.0.1')).toBe(true)
      expect(isInternalAddress('172.31.255.255')).toBe(true)
    })

    it('allows 172.15.x.x and 172.32.x.x', () => {
      expect(isInternalAddress('172.15.0.1')).toBe(false)
      expect(isInternalAddress('172.32.0.1')).toBe(false)
    })

    it('blocks 192.168.0.0/16', () => {
      expect(isInternalAddress('192.168.0.1')).toBe(true)
      expect(isInternalAddress('192.168.255.255')).toBe(true)
    })
  })

  describe('IPv4 link-local', () => {
    it('blocks 169.254.0.0/16', () => {
      expect(isInternalAddress('169.254.0.1')).toBe(true)
      expect(isInternalAddress('169.254.169.254')).toBe(true) // AWS metadata
    })
  })

  describe('CGNAT range', () => {
    it('blocks 100.64.0.0/10', () => {
      expect(isInternalAddress('100.64.0.1')).toBe(true)
      expect(isInternalAddress('100.127.255.255')).toBe(true)
    })

    it('allows 100.63.x.x and 100.128.x.x', () => {
      expect(isInternalAddress('100.63.0.1')).toBe(false)
      expect(isInternalAddress('100.128.0.1')).toBe(false)
    })
  })

  describe('reserved/experimental ranges', () => {
    it('blocks 240.0.0.0/4', () => {
      expect(isInternalAddress('240.0.0.1')).toBe(true)
      expect(isInternalAddress('255.255.255.254')).toBe(true)
    })

    it('blocks broadcast 255.255.x.x', () => {
      expect(isInternalAddress('255.255.255.255')).toBe(true)
    })

    it('blocks 0.0.0.0/8', () => {
      expect(isInternalAddress('0.0.0.0')).toBe(true)
      expect(isInternalAddress('0.1.2.3')).toBe(true)
    })
  })

  describe('hostnames', () => {
    it('blocks localhost', () => {
      expect(isInternalAddress('localhost')).toBe(true)
    })

    it('blocks *.localhost', () => {
      expect(isInternalAddress('foo.localhost')).toBe(true)
      expect(isInternalAddress('bar.baz.localhost')).toBe(true)
    })

    it('blocks 0.0.0.0', () => {
      expect(isInternalAddress('0.0.0.0')).toBe(true)
    })

    it('allows public hostnames', () => {
      expect(isInternalAddress('example.com')).toBe(false)
      expect(isInternalAddress('api.twilio.com')).toBe(false)
    })
  })

  describe('IPv6', () => {
    it('blocks ::1 (loopback)', () => {
      expect(isInternalAddress('::1')).toBe(true)
    })

    it('blocks :: (unspecified)', () => {
      expect(isInternalAddress('::')).toBe(true)
    })

    it('blocks fe80:: (link-local)', () => {
      expect(isInternalAddress('fe80::1')).toBe(true)
      // Note: fe80%eth0 without a colon is not detected as IPv6
      // (falls into hostname path, not matched by link-local check)
      expect(isInternalAddress('fe80::1%eth0')).toBe(true)
    })

    it('blocks fc00::/fd00:: (unique local)', () => {
      expect(isInternalAddress('fc00::1')).toBe(true)
      expect(isInternalAddress('fd00::1')).toBe(true)
    })

    it('blocks IPv4-mapped IPv6 for private ranges', () => {
      expect(isInternalAddress('::ffff:127.0.0.1')).toBe(true)
      expect(isInternalAddress('::ffff:10.0.0.1')).toBe(true)
      expect(isInternalAddress('::ffff:192.168.1.1')).toBe(true)
      expect(isInternalAddress('::ffff:169.254.169.254')).toBe(true)
    })

    it('allows IPv4-mapped IPv6 for public addresses', () => {
      expect(isInternalAddress('::ffff:8.8.8.8')).toBe(false)
    })

    it('strips brackets from IPv6', () => {
      expect(isInternalAddress('[::1]')).toBe(true)
      expect(isInternalAddress('[fe80::1]')).toBe(true)
    })
  })

  describe('public addresses', () => {
    it('allows 8.8.8.8', () => {
      expect(isInternalAddress('8.8.8.8')).toBe(false)
    })

    it('allows 1.1.1.1', () => {
      expect(isInternalAddress('1.1.1.1')).toBe(false)
    })

    it('allows typical web hosts', () => {
      expect(isInternalAddress('93.184.216.34')).toBe(false) // example.com
    })
  })
})

describe('validateExternalUrl', () => {
  it('returns null for valid HTTPS URL', () => {
    expect(validateExternalUrl('https://example.com/path')).toBeNull()
  })

  it('returns null for valid HTTP URL', () => {
    expect(validateExternalUrl('http://example.com/api')).toBeNull()
  })

  it('returns error for invalid URL', () => {
    expect(validateExternalUrl('not-a-url')).not.toBeNull()
  })

  it('returns error for non-HTTP protocol', () => {
    expect(validateExternalUrl('ftp://example.com/file')).not.toBeNull()
    expect(validateExternalUrl('file:///etc/passwd')).not.toBeNull()
    expect(validateExternalUrl('javascript:alert(1)')).not.toBeNull()
  })

  it('returns error for internal addresses', () => {
    expect(validateExternalUrl('http://localhost/api')).not.toBeNull()
    expect(validateExternalUrl('http://127.0.0.1/api')).not.toBeNull()
    expect(validateExternalUrl('http://192.168.1.1/')).not.toBeNull()
    expect(validateExternalUrl('http://10.0.0.1/')).not.toBeNull()
    expect(validateExternalUrl('http://169.254.169.254/latest/meta-data/')).not.toBeNull()
  })

  it('uses custom label in error messages', () => {
    const result = validateExternalUrl('not-a-url', 'Webhook URL')
    expect(result).toContain('Webhook URL')
  })

  it('uses default label when not specified', () => {
    const result = validateExternalUrl('not-a-url')
    expect(result).toContain('URL')
  })

  it('allows public URLs', () => {
    expect(validateExternalUrl('https://api.twilio.com/2010-04-01')).toBeNull()
    expect(validateExternalUrl('https://hooks.slack.com/services/T00/B00/xxx')).toBeNull()
  })
})
