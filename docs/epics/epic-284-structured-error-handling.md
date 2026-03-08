# Epic 284: Structured Error Handling & Observability

**Status**: PENDING
**Priority**: High
**Depends on**: 283
**Blocks**: None
**Branch**: `desktop`

## Summary

Add correlation IDs, structured error logging, error counters, and a metrics endpoint to surface backend health. Wrap all DO alarm() methods and critical paths in structured error handling to prevent silent failures.

## Problem Statement

The backend currently has significant observability gaps that make debugging production issues difficult:

1. **Silent alarm failures**: DO `alarm()` methods in ShiftManagerDO, SettingsDO, ConversationDO, and IdentityDO have no try-catch. If an alarm handler throws, the alarm is consumed and the error is logged as an unhandled exception with no context about which DO or which operation failed. From `apps/worker/durable-objects/settings-do.ts` line 191:
   ```typescript
   override async alarm() {
     const now = Date.now()
     // No try-catch — if storage.list() throws, alarm is lost
     const rlKeys = await this.ctx.storage.list({ prefix: 'ratelimit:' })
     // ...
   }
   ```

2. **No correlation IDs**: When a request flows through Worker route -> DO -> Nostr publisher -> push dispatcher, there is no way to trace the chain. A failure in the push dispatcher shows up as an isolated `console.error` with no link to the originating request.

3. **Auth failures not logged**: `apps/worker/lib/auth.ts` returns 401/403 responses but does not log the attempt. Failed login attempts from an attacker generate no audit trail. Rate-limit triggers in SettingsDO (line 315) are not logged either.

4. **Error swallowing in fire-and-forget calls**: Several places use `.catch(() => {})` or `catch { /* silently skip */ }`:
   - `CallRouterDO.publishNostrEvent()` line 516-518: `catch { // Nostr not configured — silently skip }`
   - `CallRouterDO.dispatchPush()` line 533-536: `catch { // Push not configured — silently skip }`
   - `CallRouterDO.publishPresenceUpdate()` line 551: `catch {}`
   - These hide real errors (relay down, push service misconfigured) behind "not configured" assumptions.

5. **No error counters**: There is no way to answer "how many auth failures happened today?" or "is the relay dropping events?" without reading raw logs.

6. **Inconsistent logging**: Some modules use `console.error('[module]', ...)`, some use `console.warn(...)`, and some use no prefix at all. The `apps/worker/lib/logger.ts` file exists but is not widely used.

## Implementation

### Phase 1: Structured Logger

Enhance the existing `apps/worker/lib/logger.ts` to support structured JSON logging with correlation IDs and severity levels.

**`apps/worker/lib/logger.ts`:**

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  requestId?: string
  module: string
  [key: string]: unknown
}

/**
 * Structured logger that outputs JSON log entries.
 * In CF Workers, console.log is captured by logpush / tail workers.
 * JSON format enables structured querying in log aggregation systems.
 */
export class Logger {
  constructor(
    private readonly module: string,
    private readonly requestId?: string,
  ) {}

  /** Create a child logger with the same requestId but different module */
  child(module: string): Logger {
    return new Logger(module, this.requestId)
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data }
    if (error instanceof Error) {
      errorData.errorName = error.name
      errorData.errorMessage = error.message
      errorData.stack = error.stack?.split('\n').slice(0, 5).join('\n')
    } else if (error !== undefined) {
      errorData.errorRaw = String(error)
    }
    this.log('error', message, errorData)
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      module: this.module,
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...data,
    }

    // Use appropriate console method so CF logpush captures severity
    switch (level) {
      case 'debug': console.debug(JSON.stringify(entry)); break
      case 'info': console.log(JSON.stringify(entry)); break
      case 'warn': console.warn(JSON.stringify(entry)); break
      case 'error': console.error(JSON.stringify(entry)); break
    }
  }
}

/**
 * Create a logger for a request context.
 * If no requestId is provided, one is generated.
 */
export function createLogger(module: string, requestId?: string): Logger {
  return new Logger(module, requestId || crypto.randomUUID().slice(0, 8))
}
```

### Phase 2: Correlation ID Middleware

Add a Hono middleware that generates or propagates a request ID through the entire request lifecycle.

**`apps/worker/middleware/request-id.ts`:**

```typescript
import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { createLogger, Logger } from '../lib/logger'

/**
 * Middleware that assigns a correlation ID to every request.
 * If the client sends X-Request-ID, it is used (truncated to 36 chars).
 * Otherwise, a short UUID is generated.
 *
 * The ID is:
 * 1. Set on the context as 'requestId' for downstream access
 * 2. Set on the context as 'log' — a Logger instance with the requestId bound
 * 3. Returned in the X-Request-ID response header
 * 4. Propagated to DO calls via X-Request-ID header
 */
export async function requestIdMiddleware(c: Context<AppEnv>, next: Next) {
  const clientId = c.req.header('X-Request-ID')
  const requestId = clientId
    ? clientId.slice(0, 36).replace(/[^a-zA-Z0-9-]/g, '')
    : crypto.randomUUID().slice(0, 8)

  c.set('requestId', requestId)
  c.set('log', createLogger('worker', requestId))

  await next()

  c.header('X-Request-ID', requestId)
}
```

**Propagate to DO calls — update `apps/worker/lib/do-access.ts`:**

When routes call DO methods via `fetch()`, include the request ID:

```typescript
// Helper to create DO requests with correlation ID
export function doRequest(path: string, options?: RequestInit & { requestId?: string }): Request {
  const headers = new Headers(options?.headers)
  if (options?.requestId) {
    headers.set('X-Request-ID', options.requestId)
  }
  return new Request(`http://do${path}`, { ...options, headers })
}
```

### Phase 3: Error Counters

Track error counts by category using in-memory counters that are periodically flushed to DO storage.

**`apps/worker/lib/error-counter.ts`:**

```typescript
export type ErrorCategory =
  | 'auth_failure'
  | 'auth_expired'
  | 'rate_limit'
  | 'webhook_invalid'
  | 'do_alarm_error'
  | 'do_migration_error'
  | 'telephony_error'
  | 'messaging_error'
  | 'relay_error'
  | 'push_error'
  | 'storage_error'
  | 'validation_error'
  | 'circuit_open'

interface CounterEntry {
  count: number
  lastOccurrence: string
  lastMessage?: string
}

/**
 * In-memory error counter for a DO instance.
 * Counts are approximate — they reset on DO eviction.
 * For persistent counters, call `flush()` to write to DO storage.
 */
export class ErrorCounter {
  private counters = new Map<ErrorCategory, CounterEntry>()

  increment(category: ErrorCategory, message?: string): void {
    const existing = this.counters.get(category)
    if (existing) {
      existing.count++
      existing.lastOccurrence = new Date().toISOString()
      if (message) existing.lastMessage = message
    } else {
      this.counters.set(category, {
        count: 1,
        lastOccurrence: new Date().toISOString(),
        lastMessage: message,
      })
    }
  }

  getAll(): Record<string, CounterEntry> {
    return Object.fromEntries(this.counters)
  }

  /** Write current counters to DO storage (additive — merges with existing) */
  async flush(storage: DurableObjectStorage): Promise<void> {
    const stored = await storage.get<Record<string, CounterEntry>>('error-counters') || {}
    for (const [category, entry] of this.counters) {
      if (stored[category]) {
        stored[category].count += entry.count
        stored[category].lastOccurrence = entry.lastOccurrence
        if (entry.lastMessage) stored[category].lastMessage = entry.lastMessage
      } else {
        stored[category] = { ...entry }
      }
    }
    await storage.put('error-counters', stored)
    // Reset in-memory counters after flush
    this.counters.clear()
  }

  /** Read persisted counters from storage */
  static async fromStorage(storage: DurableObjectStorage): Promise<Record<string, CounterEntry>> {
    return await storage.get<Record<string, CounterEntry>>('error-counters') || {}
  }

  /** Reset persisted counters (admin action) */
  static async reset(storage: DurableObjectStorage): Promise<void> {
    await storage.delete('error-counters')
  }
}
```

### Phase 4: Wrap All DO Alarm Methods

Add try-catch with structured logging and error counting to every DO alarm:

**Pattern to apply to all DOs:**

```typescript
// apps/worker/durable-objects/settings-do.ts
import { createLogger } from '../lib/logger'
import { ErrorCounter } from '../lib/error-counter'

export class SettingsDO extends DurableObject<Env> {
  private log = createLogger('SettingsDO')
  private errors = new ErrorCounter()

  // ...

  override async alarm() {
    try {
      const now = Date.now()

      // Clean up expired rate limit entries
      const rlKeys = await this.ctx.storage.list({ prefix: 'ratelimit:' })
      let cleaned = 0
      for (const [key, value] of rlKeys) {
        const timestamps = value as number[]
        const recent = timestamps.filter(t => now - t < 60_000)
        if (recent.length === 0) {
          await this.ctx.storage.delete(key)
          cleaned++
        } else {
          await this.ctx.storage.put(key, recent)
        }
      }

      // Clean up expired CAPTCHA state
      const captchaKeys = await this.ctx.storage.list({ prefix: 'captcha:' })
      let captchaCleaned = 0
      for (const [key, value] of captchaKeys) {
        const data = value as { createdAt: number }
        if (now - data.createdAt > 5 * 60 * 1000) {
          await this.ctx.storage.delete(key)
          captchaCleaned++
        }
      }

      if (cleaned > 0 || captchaCleaned > 0) {
        this.log.info('Alarm cleanup completed', {
          rateLimitCleaned: cleaned,
          captchaCleaned,
        })
      }
    } catch (error) {
      this.log.error('Alarm handler failed', error)
      this.errors.increment('do_alarm_error', error instanceof Error ? error.message : 'unknown')

      // Reschedule alarm so cleanup retries
      try {
        await this.ctx.storage.setAlarm(Date.now() + 60_000) // retry in 1 minute
      } catch {
        // If even setAlarm fails, we're in trouble — log and give up
        this.log.error('Failed to reschedule alarm after error')
      }
    }
  }
}
```

**Apply this pattern to all 7 DOs:**
- `SettingsDO.alarm()` — rate-limit cleanup, CAPTCHA cleanup
- `IdentityDO.alarm()` — challenge cleanup, session cleanup, provision room cleanup
- `ConversationDO.alarm()` — inactive conversation auto-close
- `ShiftManagerDO.alarm()` — shift reminder notifications
- `CallRouterDO` — no alarm currently, but add one for stale call cleanup
- `BlastDO.alarm()` — batch delivery processing
- `RecordsDO` — no alarm currently, but Epic 285 will add one

### Phase 5: Auth Failure Logging

**`apps/worker/lib/auth.ts` — add logging for auth failures:**

```typescript
import { createLogger } from './logger'

const log = createLogger('auth')

// In the auth verification function:
export async function verifyAuth(request: Request, env: Env): Promise<AuthResult | Response> {
  // ... existing auth logic ...

  // Log auth failures with context (but NOT the credentials themselves)
  if (!valid) {
    log.warn('Auth verification failed', {
      method: request.method,
      path: new URL(request.url).pathname,
      authType: authHeader?.startsWith('Bearer') ? 'session' : 'nostr',
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      reason: failureReason,
    })
    // Note: do NOT log the auth header value itself
    return new Response('Unauthorized', { status: 401 })
  }
}
```

**`apps/worker/durable-objects/settings-do.ts` — log rate limit triggers:**

```typescript
private async checkRateLimit(data: { key: string; maxPerMinute: number }): Promise<Response> {
  // ... existing logic ...

  const limited = recent.length >= data.maxPerMinute
  if (limited) {
    this.log.warn('Rate limit triggered', {
      key: data.key,
      count: recent.length,
      maxPerMinute: data.maxPerMinute,
    })
    this.errors.increment('rate_limit', data.key)
  }
  return Response.json({ limited })
}
```

### Phase 6: Metrics Endpoint

**`apps/worker/routes/metrics.ts` — expose error counters and health:**

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { ErrorCounter } from '../lib/error-counter'

const metrics = new Hono<AppEnv>()

// Only admins can view metrics
metrics.use('*', requirePermission('settings:read'))

/**
 * GET /metrics — aggregate error counters from all DOs
 */
metrics.get('/', async (c) => {
  const dos = getDOs(c.env)

  // Fetch error counters from each DO
  const [settingsRes, identityRes, conversationsRes, callsRes, shiftsRes] = await Promise.allSettled([
    dos.settings.fetch(new Request('http://do/metrics/errors')),
    dos.identity.fetch(new Request('http://do/metrics/errors')),
    dos.conversations.fetch(new Request('http://do/metrics/errors')),
    dos.calls.fetch(new Request('http://do/metrics/errors')),
    dos.shifts.fetch(new Request('http://do/metrics/errors')),
  ])

  const parseResult = async (result: PromiseSettledResult<Response>) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      return await result.value.json()
    }
    return {}
  }

  return c.json({
    timestamp: new Date().toISOString(),
    errors: {
      settings: await parseResult(settingsRes),
      identity: await parseResult(identityRes),
      conversations: await parseResult(conversationsRes),
      calls: await parseResult(callsRes),
      shifts: await parseResult(shiftsRes),
    },
  })
})

/**
 * POST /metrics/reset — reset all error counters (admin action)
 */
metrics.post('/reset', async (c) => {
  const dos = getDOs(c.env)

  await Promise.allSettled([
    dos.settings.fetch(new Request('http://do/metrics/reset', { method: 'POST' })),
    dos.identity.fetch(new Request('http://do/metrics/reset', { method: 'POST' })),
    dos.conversations.fetch(new Request('http://do/metrics/reset', { method: 'POST' })),
    dos.calls.fetch(new Request('http://do/metrics/reset', { method: 'POST' })),
    dos.shifts.fetch(new Request('http://do/metrics/reset', { method: 'POST' })),
  ])

  return c.json({ ok: true })
})

export default metrics
```

**Add metrics routes to each DO:**

```typescript
// In each DO's constructor, add:
this.router.get('/metrics/errors', async () => {
  const stored = await ErrorCounter.fromStorage(this.ctx.storage)
  const live = this.errors.getAll()
  // Merge live (in-memory) with stored (persisted)
  const merged = { ...stored }
  for (const [cat, entry] of Object.entries(live)) {
    if (merged[cat]) {
      merged[cat].count += entry.count
      merged[cat].lastOccurrence = entry.lastOccurrence
    } else {
      merged[cat] = entry
    }
  }
  return Response.json(merged)
})

this.router.post('/metrics/reset', async () => {
  await ErrorCounter.reset(this.ctx.storage)
  return Response.json({ ok: true })
})
```

### Phase 7: Replace Silent Catches

Replace all `catch { /* silently skip */ }` patterns with structured logging:

```typescript
// BEFORE (CallRouterDO.publishNostrEvent):
} catch {
  // Nostr not configured — silently skip
}

// AFTER:
} catch (error) {
  // Only log if this looks like a real error, not "not configured"
  if (this.env.SERVER_NOSTR_SECRET) {
    this.log.error('Nostr event publish failed', error, {
      kind,
      eventType: content.type,
    })
    this.errors.increment('relay_error')
  }
  // If SERVER_NOSTR_SECRET is not set, silently skip (genuinely not configured)
}
```

## Files to Modify

- `apps/worker/lib/logger.ts` — rewrite with structured JSON logging, correlation IDs
- `apps/worker/lib/error-counter.ts` — **new** error counting utility
- `apps/worker/middleware/request-id.ts` — **new** correlation ID middleware
- `apps/worker/lib/do-access.ts` — add `doRequest` helper for correlation ID propagation
- `apps/worker/types.ts` — extend AppEnv Variables with `requestId` and `log`
- `apps/worker/index.ts` — register `requestIdMiddleware`
- `apps/worker/durable-objects/settings-do.ts` — wrap alarm, add logger/counter, log rate limits
- `apps/worker/durable-objects/identity-do.ts` — wrap alarm, add logger/counter
- `apps/worker/durable-objects/conversation-do.ts` — wrap alarm, add logger/counter
- `apps/worker/durable-objects/call-router.ts` — add logger/counter, replace silent catches
- `apps/worker/durable-objects/shift-manager.ts` — wrap alarm, add logger/counter
- `apps/worker/durable-objects/blast-do.ts` — wrap alarm, add logger/counter
- `apps/worker/durable-objects/records-do.ts` — add logger/counter
- `apps/worker/lib/auth.ts` — log auth failures with structured context
- `apps/worker/routes/metrics.ts` — extend with error counter aggregation, circuit breaker state
- `apps/worker/routes/telephony.ts` — replace `console.error` with structured logger

## Testing

### Unit Tests
- `Logger` outputs valid JSON to console with correct level, module, requestId
- `ErrorCounter.increment` tracks counts per category
- `ErrorCounter.flush` merges with stored counters correctly
- `ErrorCounter.reset` clears stored counters
- Correlation ID middleware generates IDs, propagates X-Request-ID header
- Correlation ID middleware sanitizes client-provided IDs (max length, alphanumeric)

### Integration Tests (Playwright)
- Make a request, verify `X-Request-ID` is returned in response headers
- Make a request with `X-Request-ID`, verify same ID is returned
- Trigger an auth failure, verify it appears in `/api/metrics` error counters
- Verify `/api/metrics` returns structured error data for all DOs
- Verify `/api/metrics/reset` clears counters

### Observability Tests
- Intentionally cause a DO alarm error (e.g., corrupt storage), verify structured error log is emitted
- Verify rate limit triggers produce log entries with key and count
- Verify auth failures produce log entries with path and auth type (but not credentials)

## Acceptance Criteria

- [ ] Every request gets a correlation ID (generated or from `X-Request-ID` header)
- [ ] Correlation ID appears in all log entries for the request chain
- [ ] `X-Request-ID` is returned in every response
- [ ] All DO `alarm()` methods are wrapped in try-catch with structured logging
- [ ] Failed alarms are rescheduled (retry in 1 minute)
- [ ] Auth failures are logged with method, path, auth type, IP (not credentials)
- [ ] Rate limit triggers are logged with key and count
- [ ] Error counters track counts per category across all DOs
- [ ] `/api/metrics` endpoint returns aggregate error counters (admin-only)
- [ ] All `catch { /* silently skip */ }` patterns replaced with conditional logging
- [ ] All `console.error`/`console.warn` calls in DO code use structured `Logger`
- [ ] All existing tests pass without modification
- [ ] `bun run test:changed` passes

## Risk Assessment

**Risk**: Structured JSON logging increases log volume and cost in CF logpush or third-party log aggregation.

**Mitigation**: Use `debug` level for verbose output that can be filtered in production. Error and warn logs are the primary concern and should be low-volume (they only fire on actual problems). Add a `LOG_LEVEL` environment variable to control verbosity.

**Risk**: Correlation ID propagation to DOs requires changing how DO `fetch()` calls are made throughout the codebase. Missing one call means a gap in the trace.

**Mitigation**: The `doRequest()` helper makes it easy to add the header. Do a codebase-wide search for `new Request('http://do/` to find all DO calls. This can be done incrementally — missing correlation IDs degrade to auto-generated IDs (still useful, just not linked to the parent request).

**Risk**: Error counters in DO storage could grow large over time if many error categories accumulate.

**Mitigation**: The counter map is bounded by the number of `ErrorCategory` enum values (currently 13). Each entry is ~100 bytes. The `/api/metrics/reset` endpoint allows admins to clear counters. Consider adding automatic counter rotation (daily/weekly) in a future iteration.
