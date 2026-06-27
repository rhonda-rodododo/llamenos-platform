/**
 * PostgreSQL error detection utilities.
 *
 * Bun's native SQL driver wraps PG errors with `code: 'ERR_POSTGRES_SERVER_ERROR'`
 * instead of the raw `'23505'`. Drizzle then wraps that in a `DrizzleQueryError`.
 * These helpers check both the error message and the `.cause` chain.
 */

/**
 * Detect PostgreSQL unique-constraint / duplicate-key violations across driver layers.
 */
export function isDuplicateKeyError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message.toLowerCase()
  if (msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('23505')) {
    return true
  }
  // Check .cause (Drizzle wraps the native driver error)
  const cause = (e as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const causeMsg = cause.message.toLowerCase()
    if (causeMsg.includes('duplicate key') || causeMsg.includes('unique constraint') || causeMsg.includes('23505')) {
      return true
    }
    if ((cause as { code?: string }).code === '23505') return true
  }
  // Direct .code check (node-postgres style)
  if ((e as { code?: string }).code === '23505') return true
  return false
}
