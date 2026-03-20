import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseAuthHeader, parseSessionHeader, validateToken, verifyAuthToken } from '@worker/lib/auth'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { AUTH_PREFIX } from '@shared/crypto-labels'

describe('parseAuthHeader', () => {
  it('returns null for null header', () => {
    expect(parseAuthHeader(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAuthHeader('')).toBeNull()
  })

  it('returns null for non-Bearer header', () => {
    expect(parseAuthHeader('Basic dXNlcjpwYXNz')).toBeNull()
  })

  it('returns null for "Bearer " without payload', () => {
    expect(parseAuthHeader('Bearer ')).toBeNull()
  })

  it('returns null for invalid JSON after Bearer', () => {
    expect(parseAuthHeader('Bearer not-json')).toBeNull()
  })

  it('parses valid Bearer JSON payload', () => {
    const payload = { pubkey: 'abc', timestamp: 1234, token: 'def' }
    const result = parseAuthHeader(`Bearer ${JSON.stringify(payload)}`)
    expect(result).toEqual(payload)
  })

  it('preserves all fields in the payload', () => {
    const payload = {
      pubkey: '1234567890abcdef',
      timestamp: Date.now(),
      token: 'fedcba0987654321',
    }
    const result = parseAuthHeader(`Bearer ${JSON.stringify(payload)}`)
    expect(result?.pubkey).toBe(payload.pubkey)
    expect(result?.timestamp).toBe(payload.timestamp)
    expect(result?.token).toBe(payload.token)
  })
})

describe('parseSessionHeader', () => {
  it('returns null for null header', () => {
    expect(parseSessionHeader(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSessionHeader('')).toBeNull()
  })

  it('returns null for non-Session header', () => {
    expect(parseSessionHeader('Bearer token')).toBeNull()
  })

  it('parses valid Session header', () => {
    expect(parseSessionHeader('Session abc123')).toBe('abc123')
  })

  it('trims whitespace from session token', () => {
    expect(parseSessionHeader('Session   abc123  ')).toBe('abc123')
  })
})

describe('validateToken', () => {
  it('returns false when pubkey is missing', () => {
    expect(validateToken({ pubkey: '', timestamp: Date.now(), token: 'abc' })).toBe(false)
  })

  it('returns false when timestamp is missing (0)', () => {
    expect(validateToken({ pubkey: 'abc', timestamp: 0, token: 'def' })).toBe(false)
  })

  it('returns false when token is missing', () => {
    expect(validateToken({ pubkey: 'abc', timestamp: Date.now(), token: '' })).toBe(false)
  })

  it('returns false when token is expired (> 5 minutes old)', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000 - 1
    expect(validateToken({
      pubkey: 'abc',
      timestamp: fiveMinutesAgo,
      token: 'def',
    })).toBe(false)
  })

  it('returns false when token timestamp is in the far future', () => {
    const fiveMinutesAhead = Date.now() + 5 * 60 * 1000 + 1
    expect(validateToken({
      pubkey: 'abc',
      timestamp: fiveMinutesAhead,
      token: 'def',
    })).toBe(false)
  })

  it('returns true for valid, fresh token', () => {
    expect(validateToken({
      pubkey: 'abc',
      timestamp: Date.now(),
      token: 'def',
    })).toBe(true)
  })

  it('returns true for token at the edge of 5-minute window', () => {
    const justUnder5Min = Date.now() - 4 * 60 * 1000
    expect(validateToken({
      pubkey: 'abc',
      timestamp: justUnder5Min,
      token: 'def',
    })).toBe(true)
  })

  it('allows slightly future timestamps within window', () => {
    const slightFuture = Date.now() + 60 * 1000 // 1 minute ahead
    expect(validateToken({
      pubkey: 'abc',
      timestamp: slightFuture,
      token: 'def',
    })).toBe(true)
  })
})

describe('verifyAuthToken', () => {
  // Generate a real keypair for testing
  const privKey = hexToBytes('a'.repeat(64).replace(/^a/, '1')) // valid private key
  const privKeyForSign = privKey
  const pubkeyHex = bytesToHex(schnorr.getPublicKey(privKeyForSign))

  function createSignedToken(timestamp: number, method?: string, path?: string): string {
    let message: string
    if (method && path) {
      message = `${AUTH_PREFIX}${pubkeyHex}:${timestamp}:${method}:${path}`
    } else {
      message = `${AUTH_PREFIX}${pubkeyHex}:${timestamp}`
    }
    const messageHash = sha256(utf8ToBytes(message))
    return bytesToHex(schnorr.sign(messageHash, privKeyForSign))
  }

  it('rejects unbound tokens without method/path', async () => {
    const timestamp = Date.now()
    const token = createSignedToken(timestamp)
    const result = await verifyAuthToken({ pubkey: pubkeyHex, timestamp, token })
    expect(result).toBe(false) // method+path binding is required
  })

  it('returns true for valid request-bound token', async () => {
    const timestamp = Date.now()
    const token = createSignedToken(timestamp, 'GET', '/api/notes')
    const result = await verifyAuthToken({ pubkey: pubkeyHex, timestamp, token }, 'GET', '/api/notes')
    expect(result).toBe(true)
  })

  it('returns false for expired token', async () => {
    const timestamp = Date.now() - 6 * 60 * 1000
    const token = createSignedToken(timestamp, 'GET', '/api/notes')
    const result = await verifyAuthToken({ pubkey: pubkeyHex, timestamp, token }, 'GET', '/api/notes')
    expect(result).toBe(false)
  })

  it('returns false for wrong pubkey', async () => {
    const timestamp = Date.now()
    const token = createSignedToken(timestamp, 'GET', '/api/notes')
    const wrongPubkey = '0'.repeat(64)
    const result = await verifyAuthToken({ pubkey: wrongPubkey, timestamp, token }, 'GET', '/api/notes')
    expect(result).toBe(false)
  })

  it('returns false for tampered token', async () => {
    const timestamp = Date.now()
    const token = createSignedToken(timestamp, 'GET', '/api/notes')
    const tampered = '0' + token.slice(1)
    const result = await verifyAuthToken({ pubkey: pubkeyHex, timestamp, token: tampered }, 'GET', '/api/notes')
    expect(result).toBe(false)
  })

  it('returns false for missing fields', async () => {
    const result = await verifyAuthToken({ pubkey: '', timestamp: Date.now(), token: 'abc' }, 'GET', '/api/test')
    expect(result).toBe(false)
  })

  it('rejects unbound token even when method/path provided', async () => {
    const timestamp = Date.now()
    const token = createSignedToken(timestamp) // unbound — signed without method/path
    const result = await verifyAuthToken({ pubkey: pubkeyHex, timestamp, token }, 'GET', '/api/notes')
    expect(result).toBe(false) // no fallback — unbound tokens are rejected
  })

  it('rejects bound token used against wrong endpoint', async () => {
    const timestamp = Date.now()
    const token = createSignedToken(timestamp, 'GET', '/api/notes')
    const result = await verifyAuthToken({ pubkey: pubkeyHex, timestamp, token }, 'DELETE', '/api/users/abc')
    expect(result).toBe(false)
  })

  it('returns false for completely invalid token hex', async () => {
    const result = await verifyAuthToken({
      pubkey: pubkeyHex,
      timestamp: Date.now(),
      token: 'not-hex',
    })
    expect(result).toBe(false)
  })
})
