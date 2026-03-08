# Epic 283: Input Validation with Zod

**Status**: PENDING
**Priority**: High
**Depends on**: None
**Blocks**: 284
**Branch**: `desktop`

## Summary

Add Zod schema validation to all REST API endpoints. Validate query parameters, request bodies, and path parameters with descriptive error responses. Integrate with Hono via shared validation middleware.

## Problem Statement

The API currently has minimal or inconsistent input validation:

1. **Pagination parameters are unbounded**: `parseInt(url.searchParams.get('limit') || '50')` accepts any integer. A client can request `?limit=999999999` and force the server to load the entire dataset. This appears in:
   - `apps/worker/durable-objects/conversation-do.ts` lines 160-161
   - `apps/worker/durable-objects/call-router.ts` lines 37-38
   - `apps/worker/durable-objects/records-do.ts` (notes query)
   - `apps/worker/durable-objects/blast-do.ts` (subscriber/blast lists)

2. **Request body validation relies on TypeScript types**: Routes like `conversations.post('/:id/messages')` cast `await c.req.json()` to an interface type (line 205-209 in `apps/worker/routes/conversations.ts`). At runtime, there is no check that the body actually contains `encryptedContent` or `readerEnvelopes`. A malicious or buggy client can send arbitrary JSON.

3. **Path parameters are unvalidated**: UUIDs, pubkeys, and other identifiers in URL paths are passed directly to storage lookups without format validation. A path like `/volunteers/../../admin` would not bypass anything due to DORouter's segment matching, but invalid format IDs waste storage lookups.

4. **Inconsistent error formats**: Some routes return `{ error: string }` (conversations), some return plain text responses `new Response('Not found', { status: 404 })` (identity DO), and some return `{ error: string, ...details }` (permission guard). No standard error envelope.

5. **Some validation exists but is ad-hoc**: SettingsDO has manual validation for telephony provider config (lines 470-493) and custom fields (lines 329-383). This hand-written validation is verbose, error-prone, and not reusable.

## Implementation

### Phase 1: Install Zod & Define Core Schemas

**Add Zod dependency:**
```bash
bun add zod
```

Zod is ~57KB minified and has zero dependencies. It works in Cloudflare Workers, Node.js, and Bun.

**`apps/worker/schemas/common.ts` — shared validation primitives:**

```typescript
import { z } from 'zod'

/** Hex-encoded 32-byte Nostr public key (x-only, 64 hex chars) */
export const pubkeySchema = z.string().regex(/^[0-9a-f]{64}$/, 'Must be a 64-character hex string')

/** UUID v4 */
export const uuidSchema = z.string().uuid()

/** E.164 phone number */
export const e164PhoneSchema = z.string().regex(/^\+\d{7,15}$/, 'Must be E.164 format (+XXXXXXXXXXX)')

/** Pagination parameters — bounded and defaulted */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/** Cursor-based pagination */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/** ISO 8601 date string */
export const isoDateSchema = z.string().datetime({ offset: true }).or(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
)

/** Standard error response envelope */
export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })).optional(),
  requestId: z.string().optional(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/** ECIES recipient envelope — used across notes, messages, files */
export const recipientEnvelopeSchema = z.object({
  pubkey: pubkeySchema,
  encryptedKey: z.string().min(1),
  ephemeralPubkey: pubkeySchema,
})

/** Key envelope — used for note author copies */
export const keyEnvelopeSchema = z.object({
  encryptedKey: z.string().min(1),
  ephemeralPubkey: pubkeySchema,
})
```

### Phase 2: Route-Specific Schemas

**`apps/worker/schemas/conversations.ts`:**

```typescript
import { z } from 'zod'
import { pubkeySchema, paginationSchema, recipientEnvelopeSchema } from './common'

export const listConversationsQuerySchema = paginationSchema.extend({
  status: z.enum(['waiting', 'active', 'closed']).optional(),
  assignedTo: pubkeySchema.optional(),
  channel: z.enum(['sms', 'whatsapp', 'signal', 'rcs', 'web']).optional(),
  type: z.enum(['report', 'conversation']).optional(),
  contactHash: z.string().optional(),
})

export const sendMessageBodySchema = z.object({
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  readerEnvelopes: z.array(recipientEnvelopeSchema).min(1, 'At least one reader envelope required'),
  plaintextForSending: z.string().optional(),
})

export const updateConversationBodySchema = z.object({
  status: z.enum(['waiting', 'active', 'closed']).optional(),
  assignedTo: pubkeySchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  data => data.status || data.assignedTo !== undefined || data.metadata,
  { message: 'At least one field to update is required' }
)

export const claimConversationBodySchema = z.object({
  pubkey: pubkeySchema,
})

export const createConversationBodySchema = z.object({
  channelType: z.enum(['sms', 'whatsapp', 'signal', 'rcs', 'web']).default('web'),
  contactIdentifierHash: z.string().default(''),
  contactLast4: z.string().max(4).optional(),
  assignedTo: pubkeySchema.optional(),
  status: z.enum(['waiting', 'active', 'closed']).default('waiting'),
  metadata: z.record(z.unknown()).optional(),
})
```

**`apps/worker/schemas/notes.ts`:**

```typescript
import { z } from 'zod'
import { pubkeySchema, paginationSchema, recipientEnvelopeSchema, keyEnvelopeSchema } from './common'

export const listNotesQuerySchema = paginationSchema.extend({
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  contactHash: z.string().optional(),
})

export const createNoteBodySchema = z.object({
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  contactHash: z.string().optional(),
  encryptedContent: z.string().min(1, 'encryptedContent is required'),
  authorEnvelope: keyEnvelopeSchema.optional(),
  adminEnvelopes: z.array(recipientEnvelopeSchema).optional(),
}).refine(
  data => data.callId || data.conversationId,
  { message: 'callId or conversationId is required' }
)

export const updateNoteBodySchema = z.object({
  encryptedContent: z.string().min(1).optional(),
  adminEnvelopes: z.array(recipientEnvelopeSchema).optional(),
})
```

**`apps/worker/schemas/volunteers.ts`:**

```typescript
import { z } from 'zod'
import { pubkeySchema, e164PhoneSchema } from './common'

export const createVolunteerBodySchema = z.object({
  pubkey: pubkeySchema,
  name: z.string().min(1).max(200),
  phone: z.string().max(20), // May be empty for non-phone volunteers
  roleIds: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  encryptedSecretKey: z.string(),
})

export const updateVolunteerBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  spokenLanguages: z.array(z.string().length(2)).optional(),
  uiLanguage: z.string().length(2).optional(),
  profileCompleted: z.boolean().optional(),
  transcriptionEnabled: z.boolean().optional(),
  onBreak: z.boolean().optional(),
  callPreference: z.enum(['phone', 'webrtc', 'both']).optional(),
})

export const adminUpdateVolunteerBodySchema = updateVolunteerBodySchema.extend({
  roles: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  messagingEnabled: z.boolean().optional(),
  supportedMessagingChannels: z.array(z.enum(['sms', 'whatsapp', 'signal', 'rcs'])).optional(),
})
```

**`apps/worker/schemas/calls.ts`:**

```typescript
import { z } from 'zod'
import { paginationSchema } from './common'

export const callHistoryQuerySchema = paginationSchema.extend({
  search: z.string().max(100).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
```

**`apps/worker/schemas/settings.ts`:**

```typescript
import { z } from 'zod'

export const spamSettingsSchema = z.object({
  voiceCaptchaEnabled: z.boolean().optional(),
  rateLimitEnabled: z.boolean().optional(),
  maxCallsPerMinute: z.number().int().min(1).max(100).optional(),
  blockDurationMinutes: z.number().int().min(1).max(1440).optional(),
})

export const callSettingsSchema = z.object({
  queueTimeoutSeconds: z.number().int().min(30).max(300).optional(),
  voicemailMaxSeconds: z.number().int().min(30).max(300).optional(),
})

export const messagingConfigSchema = z.object({
  enabledChannels: z.array(z.enum(['sms', 'whatsapp', 'signal', 'rcs'])).optional(),
  autoAssignEnabled: z.boolean().optional(),
  maxConcurrentPerVolunteer: z.number().int().min(1).max(20).optional(),
  inactivityTimeout: z.number().int().min(5).max(1440).optional(),
  welcomeMessage: z.string().max(500).optional(),
  awayMessage: z.string().max(500).optional(),
})

export const telephonyProviderSchema = z.object({
  type: z.enum(['twilio', 'signalwire', 'vonage', 'plivo', 'asterisk']),
  accountSid: z.string().optional(),
  authToken: z.string().optional(),
  apiKeySid: z.string().optional(),
  apiKeySecret: z.string().optional(),
  phoneNumber: z.string().regex(/^\+\d{7,15}$/).optional(),
  twimlAppSid: z.string().optional(),
  projectId: z.string().optional(),
  spaceUrl: z.string().url().optional(),
  applicationId: z.string().optional(),
  ariUrl: z.string().url().optional(),
  ariUsername: z.string().optional(),
  ariPassword: z.string().optional(),
})

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  permissions: z.array(z.string()),
  description: z.string().min(1).max(500),
})

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
})
```

**`apps/worker/schemas/auth.ts`:**

```typescript
import { z } from 'zod'
import { pubkeySchema } from './common'

export const bootstrapBodySchema = z.object({
  pubkey: pubkeySchema,
})

export const redeemInviteBodySchema = z.object({
  code: z.string().uuid(),
  pubkey: pubkeySchema,
})

export const createInviteBodySchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(20),
  roleIds: z.array(z.string()).min(1),
  createdBy: pubkeySchema,
})
```

**`apps/worker/schemas/blasts.ts`:**

```typescript
import { z } from 'zod'
import { paginationSchema } from './common'

export const listBlastsQuerySchema = paginationSchema.extend({
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']).optional(),
})

export const listSubscribersQuerySchema = paginationSchema.extend({
  channel: z.enum(['sms', 'whatsapp', 'signal']).optional(),
  status: z.enum(['active', 'unsubscribed', 'pending']).optional(),
})

export const createBlastBodySchema = z.object({
  name: z.string().min(1).max(200),
  content: z.object({
    body: z.string().min(1).max(1600),
    mediaUrl: z.string().url().optional(),
  }),
  channels: z.array(z.enum(['sms', 'whatsapp', 'signal'])).min(1),
  scheduledAt: z.string().datetime().optional(),
})
```

### Phase 3: Validation Middleware

**`apps/worker/middleware/validate.ts`:**

```typescript
import { z, ZodError, ZodSchema } from 'zod'
import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'

/**
 * Format Zod errors into a structured, user-friendly response.
 */
function formatZodError(error: ZodError): {
  error: string
  details: Array<{ field: string; message: string; code: string }>
} {
  return {
    error: 'Validation failed',
    details: error.issues.map(issue => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
      code: issue.code,
    })),
  }
}

/**
 * Validate request body against a Zod schema.
 * Replaces the raw body with the parsed (and defaulted/coerced) result.
 *
 * @example
 * route.post('/', validateBody(createNoteSchema), async (c) => {
 *   const body = c.get('validatedBody') // typed & validated
 * })
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return async (c: Context<AppEnv>, next: Next) => {
    const body = await c.req.json().catch(() => null)
    if (body === null) {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const result = schema.safeParse(body)
    if (!result.success) {
      return c.json(formatZodError(result.error), 400)
    }

    c.set('validatedBody', result.data)
    await next()
  }
}

/**
 * Validate query parameters against a Zod schema.
 * Useful for pagination, filters, search params.
 *
 * @example
 * route.get('/', validateQuery(listConversationsQuerySchema), async (c) => {
 *   const query = c.get('validatedQuery')
 * })
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return async (c: Context<AppEnv>, next: Next) => {
    const params: Record<string, string> = {}
    for (const [key, value] of new URL(c.req.url).searchParams) {
      params[key] = value
    }

    const result = schema.safeParse(params)
    if (!result.success) {
      return c.json(formatZodError(result.error), 400)
    }

    c.set('validatedQuery', result.data)
    await next()
  }
}

/**
 * Validate a single path parameter.
 *
 * @example
 * route.get('/:id', validateParam('id', uuidSchema), async (c) => { ... })
 */
export function validateParam(name: string, schema: ZodSchema) {
  return async (c: Context<AppEnv>, next: Next) => {
    const value = c.req.param(name)
    const result = schema.safeParse(value)
    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        details: [{ field: name, message: result.error.issues[0].message, code: result.error.issues[0].code }],
      }, 400)
    }
    await next()
  }
}
```

### Phase 4: Apply to Routes

Example of applying validation to an existing route — repeat this pattern for all routes:

**`apps/worker/routes/conversations.ts` — before/after:**

```typescript
// BEFORE:
conversations.post('/:id/messages', async (c) => {
  const body = await c.req.json() as {
    encryptedContent: string
    readerEnvelopes: import('@shared/types').RecipientEnvelope[]
    plaintextForSending?: string
  }
  // ... no validation, just type assertion ...

// AFTER:
import { validateBody, validateQuery } from '../middleware/validate'
import { sendMessageBodySchema, listConversationsQuerySchema } from '../schemas/conversations'

conversations.get('/', validateQuery(listConversationsQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as z.infer<typeof listConversationsQuerySchema>
  // query.page and query.limit are already bounded and defaulted
  // ...
})

conversations.post('/:id/messages', validateBody(sendMessageBodySchema), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof sendMessageBodySchema>
  // body.encryptedContent is guaranteed to be a non-empty string
  // body.readerEnvelopes is guaranteed to be a non-empty array of valid envelopes
  // ...
})
```

**Routes to update (all in `apps/worker/routes/`):**

| Route file | Endpoints to validate |
|------------|----------------------|
| `conversations.ts` | GET /, POST /:id/messages, PATCH /:id, POST /:id/claim |
| `notes.ts` | GET /, POST /, PATCH /:id |
| `calls.ts` | GET /history |
| `volunteers.ts` | POST /, PATCH /:pubkey |
| `invites.ts` | POST /, POST /redeem |
| `settings.ts` | PATCH /spam, PATCH /call, PATCH /telephony-provider, POST /roles, PATCH /roles/:id, PATCH /messaging |
| `auth.ts` | POST /bootstrap |
| `blasts.ts` | GET /, POST /, PATCH /:id, POST /:id/send, POST /:id/schedule |
| `shifts.ts` | POST /, PATCH /:id |
| `reports.ts` | POST /, PATCH /:id |
| `hubs.ts` | POST /, PATCH /:id |
| `uploads.ts` | POST / (file metadata validation) |

### Phase 5: Extend Hono AppEnv Types

**`apps/worker/types.ts` — add validated data to context:**

```typescript
// Add to the existing AppEnv Variables:
export type AppEnv = {
  Bindings: Env
  Variables: {
    pubkey: string
    permissions: string[]
    volunteer: Volunteer
    hubId: string
    validatedBody: unknown    // Set by validateBody middleware
    validatedQuery: unknown   // Set by validateQuery middleware
  }
}
```

## Files to Modify

- `apps/worker/schemas/common.ts` — **new** shared validation primitives
- `apps/worker/schemas/conversations.ts` — **new** conversation endpoint schemas
- `apps/worker/schemas/notes.ts` — **new** note endpoint schemas
- `apps/worker/schemas/volunteers.ts` — **new** volunteer endpoint schemas
- `apps/worker/schemas/calls.ts` — **new** call endpoint schemas
- `apps/worker/schemas/settings.ts` — **new** settings endpoint schemas
- `apps/worker/schemas/auth.ts` — **new** auth endpoint schemas
- `apps/worker/schemas/blasts.ts` — **new** blast endpoint schemas
- `apps/worker/schemas/index.ts` — **new** barrel export
- `apps/worker/middleware/validate.ts` — **new** Hono validation middleware
- `apps/worker/types.ts` — extend AppEnv Variables with validatedBody/validatedQuery
- `apps/worker/routes/conversations.ts` — apply validation middleware
- `apps/worker/routes/notes.ts` — apply validation middleware
- `apps/worker/routes/calls.ts` — apply validation middleware
- `apps/worker/routes/volunteers.ts` — apply validation middleware
- `apps/worker/routes/invites.ts` — apply validation middleware
- `apps/worker/routes/settings.ts` — apply validation middleware, replace manual validation
- `apps/worker/routes/auth.ts` — apply validation middleware
- `apps/worker/routes/blasts.ts` — apply validation middleware
- `apps/worker/routes/shifts.ts` — apply validation middleware
- `apps/worker/routes/reports.ts` — apply validation middleware
- `apps/worker/routes/hubs.ts` — apply validation middleware
- `apps/worker/routes/uploads.ts` — apply validation middleware
- `package.json` — add zod dependency

## Testing

### Unit Tests
- Each schema accepts valid input and rejects invalid input
- `paginationSchema` defaults page=1, limit=50 when not provided
- `paginationSchema` clamps page to [1, 10000] and limit to [1, 200]
- `pubkeySchema` rejects non-hex, wrong-length, uppercase hex
- `e164PhoneSchema` rejects numbers without +, too short, too long
- `sendMessageBodySchema` requires encryptedContent and at least one readerEnvelope
- `formatZodError` produces correct field paths for nested objects
- `validateBody` returns 400 with structured error on invalid input
- `validateBody` returns 400 on non-JSON bodies (HTML, plain text)
- `validateQuery` coerces string query params to numbers where schema expects numbers

### Integration Tests (Playwright)
- Send request with missing required fields — verify 400 response with field-level error details
- Send request with out-of-bounds pagination — verify it's clamped, not rejected
- Send request with invalid pubkey format — verify descriptive error message
- Verify all existing tests still pass (schemas should accept all currently-valid payloads)

### Regression Tests
- Verify SettingsDO manual validation for telephony provider can be replaced by Zod schema without behavior change
- Verify custom field validation in SettingsDO matches the new Zod schema behavior exactly

## Acceptance Criteria

- [ ] Zod is installed as a dependency
- [ ] All REST endpoints validate request bodies via `validateBody` middleware
- [ ] All REST endpoints validate query parameters via `validateQuery` middleware
- [ ] Pagination parameters are bounded (max limit: 200, max page: 10000) across all endpoints
- [ ] Error responses follow a consistent structure: `{ error: string, details?: [{ field, message, code }] }`
- [ ] Manual validation in SettingsDO (telephony provider, custom fields) is replaced by Zod schemas
- [ ] No type assertions (`as`) used for request body access — all access goes through validated data
- [ ] All existing Playwright tests pass without modification
- [ ] `bun run typecheck` passes
- [ ] `bun run test:changed` passes

## Risk Assessment

**Risk**: Zod adds ~57KB to the Worker bundle size. CF Workers have a 10MB limit for paid plans, 1MB for free.

**Mitigation**: The current Worker bundle is well under 1MB. Even with Zod, it will be well within limits. Zod's tree-shaking is effective — only imported schemas are included.

**Risk**: Existing clients may send slightly malformed data that is currently accepted (e.g., extra fields, wrong types that are silently coerced). Strict validation could break them.

**Mitigation**: Use `.passthrough()` on object schemas to allow extra fields (Zod strips unknown fields by default with `.strict()`, but `.passthrough()` is lenient). Use `.coerce.number()` for query params that were previously `parseInt`'d, preserving the coercion behavior. Roll out validation gradually — start with new endpoints, then backfill existing ones.

**Risk**: Schema definitions could drift from TypeScript types in `apps/worker/types.ts` and `packages/shared/types.ts`.

**Mitigation**: Use `z.infer<typeof schema>` to derive types from schemas where possible. For types shared with the client, keep the source-of-truth in `packages/shared/types.ts` and ensure Zod schemas match. Consider using `zod-to-json-schema` for OpenAPI generation in a future epic.
