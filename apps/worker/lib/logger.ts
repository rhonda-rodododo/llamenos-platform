/**
 * Structured JSON logger for production observability.
 *
 * Outputs JSON lines to stdout for consumption by log aggregators
 * (Loki, Elasticsearch, CloudWatch, etc.).
 *
 * On Cloudflare Workers, falls back to console.log (CF handles structured logging).
 * On Node.js, emits structured JSON with timestamps, levels, and component tags.
 *
 * Supports context binding for request correlation:
 *   const reqLog = log.child({ requestId: 'abc-123', correlationId: 'xyz' })
 *   reqLog.info('Processing request')
 *   // → { ..., requestId: "abc-123", correlationId: "xyz", msg: "Processing request" }
 */

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

interface LogEntry {
  level: LogLevel
  ts: string
  component: string
  msg: string
  requestId?: string
  correlationId?: string
  [key: string]: unknown
}

export interface Logger {
  debug: (msg: string, extra?: Record<string, unknown>) => void
  info: (msg: string, extra?: Record<string, unknown>) => void
  warn: (msg: string, extra?: Record<string, unknown>) => void
  error: (msg: string, extra?: Record<string, unknown>) => void
  /** Create a child logger with additional bound context fields */
  child: (context: Record<string, unknown>) => Logger
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return

  if (isSelfHosted) {
    // Structured JSON output for log aggregators
    const line = JSON.stringify(entry)
    if (entry.level === 'error') {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  } else {
    // CF Workers — use console methods (CF adds structure)
    const { level, component, msg, ...extra } = entry
    const prefix = `[${component}]`
    const hasExtra = Object.keys(extra).length > 1 // ts is always there
    switch (level) {
      case 'debug': console.debug(prefix, msg, ...(hasExtra ? [extra] : [])); break
      case 'info':  console.log(prefix, msg, ...(hasExtra ? [extra] : [])); break
      case 'warn':  console.warn(prefix, msg, ...(hasExtra ? [extra] : [])); break
      case 'error': console.error(prefix, msg, ...(hasExtra ? [extra] : [])); break
    }
  }
}

/**
 * Build a Logger for a given component + bound context.
 */
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
    info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
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
 */
export function createLogger(component: string): Logger {
  return buildLogger(component, {})
}
