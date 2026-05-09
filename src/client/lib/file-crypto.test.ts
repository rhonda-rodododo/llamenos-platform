import { describe, it, expect } from 'vitest'

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

describe('bytesToHex', () => {
  it('correctly pads single-digit hex values', () => {
    const input = new Uint8Array([0, 1, 15, 16, 255])
    const result = bytesToHex(input)
    expect(result).toBe('00010f10ff')
    expect(result.length).toBe(10)
  })

  it('handles all byte values 0-255', () => {
    const allBytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) allBytes[i] = i
    const hex = bytesToHex(allBytes)
    expect(hex.length).toBe(512)

    const recovered = hexToBytes(hex)
    for (let i = 0; i < 256; i++) {
      expect(recovered[i]).toBe(allBytes[i])
    }
  })

  it('handles empty array', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('')
  })

  it('handles single byte', () => {
    expect(bytesToHex(new Uint8Array([0]))).toBe('00')
    expect(bytesToHex(new Uint8Array([255]))).toBe('ff')
  })

  it('produces lowercase hex', () => {
    const result = bytesToHex(new Uint8Array([255, 254, 253]))
    expect(result).toBe('fffefd')
    expect(result).not.toMatch(/[A-F]/)
  })
})

describe('hexToBytes', () => {
  it('roundtrips all byte values', () => {
    const allBytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) allBytes[i] = i
    const hex = bytesToHex(allBytes)
    const recovered = hexToBytes(hex)
    expect(recovered).toEqual(allBytes)
  })

  it('handles empty string', () => {
    const result = hexToBytes('')
    expect(result.length).toBe(0)
  })

  it('handles odd-length hex by truncating last char', () => {
    const result = hexToBytes('abc')
    expect(result.length).toBe(1)
    expect(result[0]).toBe(0xab)
  })

  it('returns empty array for single char hex', () => {
    const result = hexToBytes('a')
    expect(result.length).toBe(0)
  })

  it('silently returns zero for invalid hex chars', () => {
    const result = hexToBytes('gg')
    expect(result.length).toBe(1)
    expect(result[0]).toBe(0)
  })

  it('handles mixed valid/invalid hex', () => {
    const result = hexToBytes('ffgg')
    expect(result.length).toBe(2)
    expect(result[0]).toBe(0xff)
    expect(result[1]).toBe(0)
  })
})

describe('hex/bytes roundtrip edge cases', () => {
  it('preserves leading zero bytes', () => {
    const original = new Uint8Array([0, 0, 0, 1, 2, 3])
    const hex = bytesToHex(original)
    const recovered = hexToBytes(hex)
    expect(recovered).toEqual(original)
    expect(hex.startsWith('000000')).toBe(true)
  })

  it('preserves trailing zero bytes', () => {
    const original = new Uint8Array([1, 2, 3, 0, 0, 0])
    const hex = bytesToHex(original)
    const recovered = hexToBytes(hex)
    expect(recovered).toEqual(original)
  })

  it('handles alternating zero/non-zero pattern', () => {
    const original = new Uint8Array([0, 255, 0, 255, 0, 255])
    const hex = bytesToHex(original)
    const recovered = hexToBytes(hex)
    expect(recovered).toEqual(original)
  })

  it('handles large arrays', () => {
    const large = new Uint8Array(10000)
    for (let i = 0; i < large.length; i++) large[i] = i % 256
    const hex = bytesToHex(large)
    const recovered = hexToBytes(hex)
    expect(recovered).toEqual(large)
  })
})
