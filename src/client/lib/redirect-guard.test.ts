/**
 * Unit tests for src/client/lib/redirect-guard.ts
 *
 * Verifies that isSafeRelativePath blocks open redirect attacks
 * while allowing legitimate intra-app navigation paths.
 */
import { describe, it, expect } from 'vitest'
import { isSafeRelativePath } from './redirect-guard'

describe('isSafeRelativePath', () => {
  describe('allowed: same-origin relative paths', () => {
    it('accepts root path', () => {
      expect(isSafeRelativePath('/')).toBe(true)
    })

    it('accepts nested path', () => {
      expect(isSafeRelativePath('/dashboard')).toBe(true)
    })

    it('accepts path with query string', () => {
      expect(isSafeRelativePath('/settings?section=passkeys')).toBe(true)
    })

    it('accepts path with hash fragment', () => {
      expect(isSafeRelativePath('/notes#entry-42')).toBe(true)
    })

    it('accepts deeply nested path', () => {
      expect(isSafeRelativePath('/admin/hubs/123/shifts')).toBe(true)
    })
  })

  describe('blocked: open redirect attacks', () => {
    it('blocks protocol-relative URL (//evil.com)', () => {
      expect(isSafeRelativePath('//evil.com')).toBe(false)
    })

    it('blocks backslash bypass (/\\evil.com)', () => {
      // Some browsers normalize /\\ to // enabling cross-origin redirect
      expect(isSafeRelativePath('/\\evil.com')).toBe(false)
    })

    it('blocks https:// absolute URL', () => {
      expect(isSafeRelativePath('https://evil.com')).toBe(false)
    })

    it('blocks http:// absolute URL', () => {
      expect(isSafeRelativePath('http://evil.com/callback')).toBe(false)
    })

    it('blocks javascript: scheme', () => {
      expect(isSafeRelativePath('javascript:alert(1)')).toBe(false)
    })

    it('blocks bare domain (no leading slash)', () => {
      expect(isSafeRelativePath('evil.com/path')).toBe(false)
    })

    it('blocks empty string', () => {
      expect(isSafeRelativePath('')).toBe(false)
    })
  })
})
