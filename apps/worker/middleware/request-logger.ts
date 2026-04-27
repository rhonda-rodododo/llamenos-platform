import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { withCorrelation } from '../lib/logger'
import { createLogger } from '../lib/logger'

const logger = createLogger('request-logger')

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header('X-Request-Id')
  const id = incoming ?? crypto.randomUUID()

  c.set('requestId', id)

  const method = c.req.method
  const path = c.req.path

  logger.info('Request started', { method, path, correlationId: id, requestId: id })

  const t0 = performance.now()

  await withCorrelation({ correlationId: id, requestId: id }, async () => {
    await next()
  })

  const durationMs = Math.round(performance.now() - t0)
  const status = c.res.status

  logger.info('Request completed', { method, path, status, durationMs, correlationId: id, requestId: id })

  c.header('X-Request-Id', id)
})
