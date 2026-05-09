import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'inactive')).toBe('base active')
  })

  it('handles arrays of classes', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })

  it('handles objects for conditional classes', () => {
    expect(cn({ active: true, disabled: false })).toBe('active')
  })

  it('returns empty string for no args', () => {
    expect(cn()).toBe('')
  })

  it('merges conflicting tailwind utilities', () => {
    expect(cn('text-sm text-red-500', 'text-lg text-blue-500')).toBe('text-lg text-blue-500')
  })
})
