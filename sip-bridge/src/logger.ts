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

export const logger = {
  debug(prefix: string, message: string): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', prefix, message))
    }
  },

  info(prefix: string, message: string): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', prefix, message))
    }
  },

  warn(prefix: string, message: string): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', prefix, message))
    }
  },

  error(prefix: string, message: string): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', prefix, message))
    }
  },
}
