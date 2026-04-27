/**
 * Structured JSON logger for production observability.
 *
 * Outputs JSON lines to stdout for consumption by log aggregators
 * (Loki, Elasticsearch, CloudWatch, etc.).
 *
 * Features:
 * - Namespace filtering via LOG_NAMESPACES env var (glob patterns, comma-separated)
 *   e.g. LOG_NAMESPACES="auth.*,telephony" to enable only those components
 * - Correlation ID propagation via AsyncLocalStorage
 * - Automatic redaction of sensitive fields (phone numbers, keys, tokens)
 * - Per-level rate limiting to prevent log floods
 */

import { AsyncLocalStorage } from 'node:async_hooks'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const isSelfHosted = typeof process !== 'undefined' && process.env?.PLATFORM === 'bun'

// Minimum log level — configurable via LOG_LEVEL env var
const minLevel: LogLevel = isSelfHosted
  ? (process.env.LOG_LEVEL as LogLevel) || 'info'
  : 'info'

// ---------------------------------------------------------------------------
// Namespace filtering (LOG_NAMESPACES="auth.*,telephony,crypto")
// ---------------------------------------------------------------------------

type NamespaceFilter = RegExp[]

function parseNamespaceFilters(): NamespaceFilter | null {
  if (!isSelfHosted) return null
  const raw = process.env.LOG_NAMESPACES
  if (!raw || raw.trim() === '*' || raw.trim() === '') return null  // allow all
  return raw.split(',').map(pattern => {
    const escaped = pattern.trim()
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars (except * and ?)
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`)
  })
}

const namespaceFilters = parseNamespaceFilters()

function isNamespaceEnabled(component: string): boolean {
  if (namespaceFilters === null) return true
  return namespaceFilters.some(re => re.test(component))
}

// ---------------------------------------------------------------------------
// Correlation ID via AsyncLocalStorage
// ---------------------------------------------------------------------------

interface CorrelationContext {
  correlationId?: string
  requestId?: string
}

const correlationStorage = new AsyncLocalStorage<CorrelationContext>()

/** Run a function with correlation context bound (use in request middleware) */
export function withCorrelation<T>(ctx: CorrelationContext, fn: () => T): T {
  return correlationStorage.run(ctx, fn)
}

/** Get the current correlation context (returns empty object outside a request) */
function getCorrelation(): CorrelationContext {
  return correlationStorage.getStore() ?? {}
}

// ---------------------------------------------------------------------------
// Sensitive field redaction
// ---------------------------------------------------------------------------

// Fields whose values should be redacted in log output
const REDACTED_KEYS = new Set([
  'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
  'authToken', 'auth_token', 'accessKey', 'access_key', 'secretKey', 'secret_key',
  'privateKey', 'private_key', 'nsec', 'npub', 'seed', 'mnemonic',
  'phone', 'phoneNumber', 'phone_number', 'callerNumber', 'caller_number',
  'authorization', 'cookie', 'hmacSecret', 'hmac_secret',
  'serverNostrSecret', 'server_nostr_secret',
])

const PHONE_PATTERN = /\b(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g
const HEX_KEY_PATTERN = /\b[0-9a-f]{64}\b/gi

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(PHONE_PATTERN, '[PHONE]')
      .replace(HEX_KEY_PATTERN, '[KEY]')
  }
  return value
}

function redactObject(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 4) return obj  // prevent deep recursion
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key) || REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, depth + 1)
    } else {
      result[key] = redactValue(value)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Rate limiting (per component+level, sliding window)
// ---------------------------------------------------------------------------

const RATE_LIMITS: Record<LogLevel, { maxPerSec: number; burstMs: number }> = {
  debug: { maxPerSec: 100, burstMs: 1000 },
  info:  { maxPerSec: 50,  burstMs: 1000 },
  warn:  { maxPerSec: 20,  burstMs: 1000 },
  error: { maxPerSec: 10,  burstMs: 1000 },
}

interface RateBucket {
  count: number
  windowStart: number
  suppressed: number
}

const rateBuckets: Map<string, RateBucket> = new Map()

/**
 * Returns true if the log entry should be emitted, false if rate-limited.
 * When suppression ends, emits a summary of suppressed count.
 */
function checkRateLimit(component: string, level: LogLevel): boolean {
  if (!isSelfHosted) return true  // no rate limiting on CF Workers
  const key = `${component}:${level}`
  const limit = RATE_LIMITS[level]
  const now = Date.now()

  let bucket = rateBuckets.get(key)
  if (!bucket) {
    bucket = { count: 0, windowStart: now, suppressed: 0 }
    rateBuckets.set(key, bucket)
  }

  const elapsed = now - bucket.windowStart
  if (elapsed >= limit.burstMs) {
    // Emit suppression summary if needed
    if (bucket.suppressed > 0) {
      const summaryLine = JSON.stringify({
        level: 'warn',
        ts: new Date().toISOString(),
        component,
        msg: `[rate-limit] suppressed ${bucket.suppressed} ${level} log entries in ${Math.round(elapsed / 1000)}s`,
      })
      process.stdout.write(summaryLine + '\n')
    }
    bucket.count = 0
    bucket.windowStart = now
    bucket.suppressed = 0
  }

  bucket.count++
  if (bucket.count > limit.maxPerSec) {
    bucket.suppressed++
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Core emit function
// ---------------------------------------------------------------------------

interface LogEntry {
  level: LogLevel
  ts: string
  component: string
  msg: string
  [key: string]: unknown
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return
  if (!isNamespaceEnabled(entry.component)) return
  if (!checkRateLimit(entry.component, entry.level)) return

  // Merge correlation context from AsyncLocalStorage
  const correlation = getCorrelation()

  // Redact the extra fields before emitting
  const { level, ts, component, msg, ...extra } = entry
  const redacted = Object.keys(extra).length > 0 ? redactObject(extra as Record<string, unknown>) : {}

  const finalEntry = {
    level,
    ts,
    component,
    msg,
    ...correlation,
    ...redacted,
  }

  if (isSelfHosted) {
    const line = JSON.stringify(finalEntry)
    if (level === 'error') {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  } else {
    // CF Workers — use console methods (CF adds structure)
    const prefix = `[${component}]`
    const hasExtra = Object.keys(redacted).length > 0 || Object.keys(correlation).length > 0
    const extra2 = hasExtra ? { ...correlation, ...redacted } : undefined
    switch (level) {
      case 'debug': console.debug(prefix, msg, ...(extra2 ? [extra2] : [])); break
      case 'info':  console.log(prefix, msg, ...(extra2 ? [extra2] : [])); break
      case 'warn':  console.warn(prefix, msg, ...(extra2 ? [extra2] : [])); break
      case 'error': console.error(prefix, msg, ...(extra2 ? [extra2] : [])); break
    }
  }
}

// ---------------------------------------------------------------------------
// Public Logger interface
// ---------------------------------------------------------------------------

export interface Logger {
  debug: (msg: string, extra?: Record<string, unknown>) => void
  info: (msg: string, extra?: Record<string, unknown>) => void
  warn: (msg: string, extra?: Record<string, unknown>) => void
  error: (msg: string, extra?: Record<string, unknown>) => void
  /** Create a child logger with additional bound context fields */
  child: (context: Record<string, unknown>) => Logger
}

function buildLogger(component: string, boundContext: Record<string, unknown>): Logger {
  function log(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
    emit({
      level,
      ts: new Date().toISOString(),
      component,
      msg,
      ...boundContext,
      ...extra,
    })
  }

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
    info:  (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn:  (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
    child: (context: Record<string, unknown>) =>
      buildLogger(component, { ...boundContext, ...context }),
  }
}

/**
 * Create a component-scoped logger.
 *
 * @example
 * const log = createLogger('auth')
 * log.info('Token verified', { pubkey: '...' })
 * // -> {"level":"info","ts":"...","component":"auth","msg":"Token verified","pubkey":"..."}
 *
 * // With request context binding:
 * const reqLog = log.child({ requestId: 'abc-123' })
 * reqLog.info('Processing')
 * // -> {"level":"info","ts":"...","component":"auth","msg":"Processing","requestId":"abc-123"}
 *
 * // With async correlation context (propagates automatically to all loggers in the request):
 * withCorrelation({ correlationId: 'xyz', requestId: 'abc' }, () => {
 *   log.info('Handling request')  // automatically includes correlationId + requestId
 * })
 */
export function createLogger(component: string): Logger {
  return buildLogger(component, {})
}
