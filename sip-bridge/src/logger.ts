/**
 * Structured logger for sip-bridge with level-based filtering.
 * Respects the LOG_LEVEL environment variable (debug | info | warn | error).
 * Default level is 'info'.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info'
const currentLevelNum = LOG_LEVELS[currentLevel] ?? LOG_LEVELS.info

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevelNum
}

function formatMessage(level: LogLevel, prefix: string, message: string): string {
  const ts = new Date().toISOString()
  return `[${ts}] [${level.toUpperCase()}] ${prefix} ${message}`
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export const logger = {
  debug(prefix: string, message: string, err?: unknown): void {
    if (shouldLog('debug')) {
      const full = err !== undefined ? `${message} — ${formatError(err)}` : message
      console.debug(formatMessage('debug', prefix, full))
    }
  },

  info(prefix: string, message: string, err?: unknown): void {
    if (shouldLog('info')) {
      const full = err !== undefined ? `${message} — ${formatError(err)}` : message
      console.info(formatMessage('info', prefix, full))
    }
  },

  warn(prefix: string, message: string, err?: unknown): void {
    if (shouldLog('warn')) {
      const full = err !== undefined ? `${message} — ${formatError(err)}` : message
      console.warn(formatMessage('warn', prefix, full))
    }
  },

  error(prefix: string, message: string, err?: unknown): void {
    if (shouldLog('error')) {
      const full = err !== undefined ? `${message} — ${formatError(err)}` : message
      console.error(formatMessage('error', prefix, full))
    }
  },
}
