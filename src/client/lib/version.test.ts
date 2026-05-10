import { describe, it, expect, vi } from 'vitest'
import { APP_API_VERSION, UPDATE_REQUIRED_EVENT, emitUpdateRequired } from './version'

describe('version constants', () => {
  it('has correct API version', () => {
    expect(APP_API_VERSION).toBe(1)
    expect(typeof APP_API_VERSION).toBe('number')
  })

  it('has correct update event name', () => {
    expect(UPDATE_REQUIRED_EVENT).toBe('llamenos:update-required')
  })
})

describe('emitUpdateRequired', () => {
  it('dispatches custom event with detail', () => {
    const listener = vi.fn()
    window.addEventListener(UPDATE_REQUIRED_EVENT, listener)

    emitUpdateRequired({ minVersion: 2, currentVersion: 1 })

    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0] as CustomEvent
    expect(event.detail).toEqual({ minVersion: 2, currentVersion: 1 })

    window.removeEventListener(UPDATE_REQUIRED_EVENT, listener)
  })
})
