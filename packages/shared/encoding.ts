/**
 * Pure TypeScript encoding utilities for hex/bytes/utf8 conversion.
 * Replaces imports from @noble/hashes/utils and @noble/ciphers/utils.
 */

const HEX_CHARS = '0123456789abcdef'

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex string must have even length')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const hi = hex.charCodeAt(i * 2)
    const lo = hex.charCodeAt(i * 2 + 1)
    bytes[i] = (hexVal(hi) << 4) | hexVal(lo)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_CHARS[bytes[i] >> 4] + HEX_CHARS[bytes[i] & 0x0f]
  }
  return hex
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function hexVal(c: number): number {
  // '0'-'9' = 48-57, 'a'-'f' = 97-102, 'A'-'F' = 65-70
  if (c >= 48 && c <= 57) return c - 48
  if (c >= 97 && c <= 102) return c - 87
  if (c >= 65 && c <= 70) return c - 55
  throw new Error(`invalid hex character: ${String.fromCharCode(c)}`)
}
