import type { Context } from 'hono'

/**
 * Fire-and-forget a background task.
 *
 * Uses `c.executionCtx.waitUntil()` when available (Cloudflare Workers)
 * and falls back to a detached promise with `.catch()` on Bun/Node.
 */
export function backgroundTask(c: Context, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task)
  } catch {
    // Bun/Node — no ExecutionContext; fire-and-forget with error logging
    task.catch(() => {})
  }
}
