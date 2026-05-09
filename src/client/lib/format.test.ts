import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatTimestamp, formatRelativeTime } from './format'

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows time only for today', () => {
    const now = new Date('2024-01-15T14:30:00Z')
    vi.setSystemTime(now)

    const result = formatTimestamp(now.toISOString())
    // Should contain time but not date
    expect(result).toMatch(/\d{1,2}:\d{2}/)
    expect(result).not.toMatch(/Jan/)
  })

  it('shows date + time for a different day', () => {
    const now = new Date('2024-01-15T14:30:00Z')
    vi.setSystemTime(now)

    const yesterday = new Date('2024-01-14T10:00:00Z')
    const result = formatTimestamp(yesterday.toISOString())
    // Should contain both date and time
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('handles invalid date gracefully', () => {
    const result = formatTimestamp('invalid')
    expect(result).toBe('Invalid Date')
  })
})

describe('formatRelativeTime', () => {
  const mockT = (key: string, opts?: Record<string, unknown>) => {
    const defaults: Record<string, string> = {
      'conversations.justNow': 'just now',
      'conversations.minutesAgo': '{{count}}m ago',
      'conversations.hoursAgo': '{{count}}h ago',
      'conversations.daysAgo': '{{count}}d ago',
    }
    let result = defaults[key] || key
    if (opts?.count !== undefined) {
      result = result.replace('{{count}}', String(opts.count))
    }
    return result
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns just now for future dates', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const future = new Date('2024-01-15T14:05:00Z')
    expect(formatRelativeTime(future.toISOString(), mockT)).toBe('just now')
  })

  it('returns just now for < 60 seconds ago', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const recent = new Date('2024-01-15T13:59:30Z')
    expect(formatRelativeTime(recent.toISOString(), mockT)).toBe('just now')
  })

  it('returns minutes ago for < 1 hour', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const fiveMinAgo = new Date('2024-01-15T13:55:00Z')
    expect(formatRelativeTime(fiveMinAgo.toISOString(), mockT)).toBe('5m ago')
  })

  it('returns hours ago for < 24 hours', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const threeHoursAgo = new Date('2024-01-15T11:00:00Z')
    expect(formatRelativeTime(threeHoursAgo.toISOString(), mockT)).toBe('3h ago')
  })

  it('returns days ago for >= 24 hours', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const twoDaysAgo = new Date('2024-01-13T14:00:00Z')
    expect(formatRelativeTime(twoDaysAgo.toISOString(), mockT)).toBe('2d ago')
  })

  it('handles exactly 60 seconds as minutes', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const exactly60Sec = new Date('2024-01-15T13:59:00Z')
    expect(formatRelativeTime(exactly60Sec.toISOString(), mockT)).toBe('1m ago')
  })

  it('handles exactly 60 minutes as hours', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const exactly60Min = new Date('2024-01-15T13:00:00Z')
    expect(formatRelativeTime(exactly60Min.toISOString(), mockT)).toBe('1h ago')
  })

  it('handles exactly 24 hours as days', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const exactly24h = new Date('2024-01-14T14:00:00Z')
    expect(formatRelativeTime(exactly24h.toISOString(), mockT)).toBe('1d ago')
  })

  it('handles very old dates', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const yearAgo = new Date('2023-01-15T14:00:00Z')
    expect(formatRelativeTime(yearAgo.toISOString(), mockT)).toBe('365d ago')
  })

  it('handles invalid date', () => {
    const now = new Date('2024-01-15T14:00:00Z')
    vi.setSystemTime(now)

    const result = formatRelativeTime('invalid', mockT)
    expect(result === 'just now' || result === 'NaNd ago').toBe(true)
  })
})

describe('formatTimestamp edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles year boundary', () => {
    const now = new Date('2024-01-01T14:30:00Z')
    vi.setSystemTime(now)

    const lastYear = new Date('2023-12-31T10:00:00Z')
    const result = formatTimestamp(lastYear.toISOString())
    expect(result).toMatch(/Dec/)
  })

  it('handles month boundary', () => {
    const now = new Date('2024-01-15T14:30:00Z')
    vi.setSystemTime(now)

    const lastMonth = new Date('2023-12-15T10:00:00Z')
    const result = formatTimestamp(lastMonth.toISOString())
    expect(result).toMatch(/Dec/)
  })

  it('handles empty string', () => {
    const result = formatTimestamp('')
    expect(result).toBe('Invalid Date')
  })
})
