import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCallTimer } from './hooks'

describe('useCallTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns zero elapsed when not started', () => {
    const { result } = renderHook(() => useCallTimer(null))
    expect(result.current.elapsed).toBe(0)
    expect(result.current.formatted).toBe('00:00')
  })

  it('starts counting when startedAt is set', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result } = renderHook(() => useCallTimer(new Date(now).toISOString()))
    expect(result.current.elapsed).toBe(0)
    expect(result.current.formatted).toBe('00:00')
  })

  it('increments every second', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result } = renderHook(() => useCallTimer(new Date(now).toISOString()))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.elapsed).toBe(1)
    expect(result.current.formatted).toBe('00:01')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.elapsed).toBe(6)
    expect(result.current.formatted).toBe('00:06')
  })

  it('formats minutes and seconds correctly', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result } = renderHook(() => useCallTimer(new Date(now).toISOString()))

    act(() => {
      vi.advanceTimersByTime(125 * 1000)
    })
    expect(result.current.elapsed).toBe(125)
    expect(result.current.formatted).toBe('02:05')
  })

  it('resets when startedAt changes to null', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result, rerender } = renderHook(
      ({ startedAt }: { startedAt: string | null }) => useCallTimer(startedAt),
      { initialProps: { startedAt: new Date(now).toISOString() as string | null } },
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.elapsed).toBe(5)

    rerender({ startedAt: null })
    expect(result.current.elapsed).toBe(0)
    expect(result.current.formatted).toBe('00:00')
  })

  it('cleans up interval on unmount', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { unmount } = renderHook(() => useCallTimer(new Date(now).toISOString()))
    unmount()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
  })
})
