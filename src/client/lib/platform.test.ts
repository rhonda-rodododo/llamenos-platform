import { describe, it, expect } from 'vitest'
import { isValidSeedHex } from './platform'

describe('isValidSeedHex', () => {
  it('accepts valid 64-char hex', () => {
    expect(isValidSeedHex('a'.repeat(64))).toBe(true)
    expect(isValidSeedHex('0'.repeat(64))).toBe(true)
    expect(isValidSeedHex('f'.repeat(64))).toBe(true)
    expect(isValidSeedHex('A'.repeat(64))).toBe(true)
    expect(isValidSeedHex('F'.repeat(64))).toBe(true)
  })

  it('rejects too short', () => {
    expect(isValidSeedHex('a'.repeat(63))).toBe(false)
  })

  it('rejects too long', () => {
    expect(isValidSeedHex('a'.repeat(65))).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(isValidSeedHex('g'.repeat(64))).toBe(false)
    expect(isValidSeedHex('x'.repeat(64))).toBe(false)
    expect(isValidSeedHex(' '.repeat(64))).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidSeedHex('')).toBe(false)
  })

  it('rejects with 0x prefix', () => {
    expect(isValidSeedHex('0x' + 'a'.repeat(62))).toBe(false)
  })
})
