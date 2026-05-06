/**
 * Unit tests for apps/worker/lib/hono-compat.ts
 *
 * Tests backgroundTask utility: waitUntil path and fallback path.
 */
import { describe, it, expect, vi } from 'vitest'
import { backgroundTask } from '@worker/lib/hono-compat'
import type { Context } from 'hono'

describe('backgroundTask', () => {
  it('calls waitUntil when executionCtx is available', () => {
    const waitUntil = vi.fn()
    const c = {
      executionCtx: { waitUntil },
    } as unknown as Context

    const task = Promise.resolve('done')
    backgroundTask(c, task)

    expect(waitUntil).toHaveBeenCalledWith(task)
  })

  it('does not throw when executionCtx.waitUntil throws', () => {
    const c = {
      get executionCtx(): never {
        throw new Error('No execution context')
      },
    } as unknown as Context

    const task = Promise.resolve('done')
    expect(() => backgroundTask(c, task)).not.toThrow()
  })

  it('catches rejected promises in fallback path (no unhandled rejection)', async () => {
    const c = {
      get executionCtx(): never {
        throw new Error('No execution context')
      },
    } as unknown as Context

    const error = new Error('task failed')
    const task = Promise.reject(error)

    // Should not throw — the .catch() in the implementation handles it
    expect(() => backgroundTask(c, task)).not.toThrow()

    // Give the microtask queue time to process
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  it('passes the exact task promise to waitUntil', () => {
    const waitUntil = vi.fn()
    const c = {
      executionCtx: { waitUntil },
    } as unknown as Context

    const specificTask = new Promise<void>(resolve => setTimeout(resolve, 100))
    backgroundTask(c, specificTask)

    expect(waitUntil).toHaveBeenCalledWith(specificTask)
  })
})
